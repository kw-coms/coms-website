package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.Notice;
import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.dto.NotificationResponse;
import com.coms.backend.dto.NotificationSummaryResponse;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
@Transactional
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final int ACTOR_LABEL_MAX = 100;
    private static final int MAX_EXTERNAL_INVITES_PER_MINUTE = 10;
    private static final int MAX_EXTERNAL_INVITES_PER_DAY = 200;

    private final NotificationRepository notificationRepository;
    private final MemberRepository memberRepository;
    private final EligibleMemberRepository eligibleMemberRepository;
    private final EmailVerificationSender mailSender;
    private final Set<String> acceptUrlAllowedHosts;

    public NotificationService(NotificationRepository notificationRepository,
                               MemberRepository memberRepository,
                               EligibleMemberRepository eligibleMemberRepository,
                               EmailVerificationSender mailSender,
                               @Value("${notification.external-invite.allowed-hosts:coms.kw.ac.kr}") String allowedHosts) {
        this.notificationRepository = notificationRepository;
        this.memberRepository = memberRepository;
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.mailSender = mailSender;
        this.acceptUrlAllowedHosts = parseAllowedHosts(allowedHosts);
    }

    private static Set<String> parseAllowedHosts(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        Set<String> hosts = new java.util.HashSet<>();
        for (String entry : raw.split(",")) {
            String trimmed = entry.trim().toLowerCase();
            if (!trimmed.isEmpty()) hosts.add(trimmed);
        }
        return Set.copyOf(hosts);
    }

    public void notifyPostComment(CommunityPost post, CommunityComment comment) {
        createIfDifferent(
                post.getAuthorStudentId(),
                comment.getStudentId(),
                Notification.Type.COMMENT_ON_POST,
                post.getId(),
                comment.getId(),
                null,
                comment.getAuthorName() + " commented on your post."
        );
    }

    public void notifyCommentReply(CommunityPost post, CommunityComment parent, CommunityComment reply) {
        createIfDifferent(
                parent.getStudentId(),
                reply.getStudentId(),
                Notification.Type.REPLY_ON_COMMENT,
                post.getId(),
                reply.getId(),
                null,
                reply.getAuthorName() + " replied to your comment."
        );
    }

    public void notifyPostRestored(CommunityPost post, String adminStudentId, String adminName) {
        String actorName = adminName == null || adminName.isBlank() ? "관리자" : adminName;
        createIfDifferent(
                post.getAuthorStudentId(),
                adminStudentId,
                Notification.Type.COMMUNITY_POST_RESTORED,
                post.getId(),
                null,
                null,
                actorName + "님이 삭제 보관함에서 \"" + post.getTitle() + "\" 글을 복원했습니다."
        );
    }

    public void notifyPostDeleted(DeletedCommunityPost snapshot, String actorStudentId, String actorName) {
        String moderatorName = actorName == null || actorName.isBlank() ? "관리자" : actorName;
        String reason = snapshot.getDeletionReason() == null || snapshot.getDeletionReason().isBlank()
                ? "삭제 사유가 기록되지 않았습니다."
                : snapshot.getDeletionReason();
        createIfDifferent(
                snapshot.getAuthorStudentId(),
                actorStudentId,
                Notification.Type.COMMUNITY_POST_DELETED,
                null,
                null,
                null,
                moderatorName + "님이 \"" + snapshot.getTitle() + "\" 글을 삭제했습니다. 사유: " + reason
        );
    }

    public Notification notifyExternalInvite(String recipientStudentId,
                                              String actorLabel,
                                              String message,
                                              String acceptUrl,
                                              boolean sendEmail) {
        if (recipientStudentId == null || recipientStudentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recipientStudentId is required");
        }
        String safeAcceptUrl = sanitizeAcceptUrl(acceptUrl);
        boolean recipientKnown = memberRepository.existsByStudentId(recipientStudentId)
                || eligibleMemberRepository.findByStudentId(recipientStudentId).isPresent();
        if (!recipientKnown) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown studentId");
        }

        Notification notification = build(
                recipientStudentId,
                null,
                Notification.Type.EXTERNAL_INVITE,
                null,
                null,
                null,
                message
        );
        notification.setActorLabel(actorLabel);
        notification.setAcceptUrl(safeAcceptUrl);
        Notification saved = notificationRepository.save(notification);

        if (sendEmail) {
            Optional<String> email = memberRepository.findByStudentId(recipientStudentId)
                    .map(member -> member.getEmail());
            if (email.isPresent()) {
                try {
                    String subject = actorLabel == null ? "초대가 도착했습니다" : "[" + actorLabel + "] 초대가 도착했습니다";
                    StringBuilder body = new StringBuilder(message);
                    if (safeAcceptUrl != null) {
                        body.append("\n\n수락 링크: ").append(safeAcceptUrl);
                    }
                    mailSender.sendExternalInvite(email.get(), subject, body.toString());
                } catch (RuntimeException e) {
                    log.warn("External invite email failed for {}", recipientStudentId, e);
                }
            } else {
                log.info("Skipping email for {} — no registered member account", recipientStudentId);
            }
        }
        return saved;
    }

    private String sanitizeAcceptUrl(String acceptUrl) {
        return sanitizeAcceptUrl(acceptUrl, false);
    }

    private String sanitizeAcceptUrl(String acceptUrl, boolean enforceHostAllowlist) {
        if (acceptUrl == null || acceptUrl.isBlank()) {
            return null;
        }
        try {
            URI parsed = new URI(acceptUrl);
            String scheme = parsed.getScheme();
            String host = parsed.getHost();
            if (scheme == null
                    || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
                    || host == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "acceptUrl must be an http(s) URL");
            }
            if (enforceHostAllowlist && !acceptUrlAllowedHosts.isEmpty()
                    && !acceptUrlAllowedHosts.contains(host.toLowerCase())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "acceptUrl host not allowed");
            }
            return acceptUrl;
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "acceptUrl is not a valid URL");
        }
    }

    private void enforceExternalInviteRateLimit(String senderStudentId) {
        LocalDateTime now = LocalDateTime.now();
        long perMinute = notificationRepository.countByActorStudentIdAndTypeAndCreatedAtAfter(
                senderStudentId, Notification.Type.EXTERNAL_INVITE, now.minusMinutes(1));
        if (perMinute >= MAX_EXTERNAL_INVITES_PER_MINUTE) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "초대 알림은 1분에 최대 " + MAX_EXTERNAL_INVITES_PER_MINUTE + "건까지 보낼 수 있습니다.");
        }
        long perDay = notificationRepository.countByActorStudentIdAndTypeAndCreatedAtAfter(
                senderStudentId, Notification.Type.EXTERNAL_INVITE, now.minusDays(1));
        if (perDay >= MAX_EXTERNAL_INVITES_PER_DAY) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "초대 알림은 하루 최대 " + MAX_EXTERNAL_INVITES_PER_DAY + "건까지 보낼 수 있습니다.");
        }
    }

    public record ExternalInviteBatchResult(int accepted, List<String> unknown, int rejected) {}

    public ExternalInviteBatchResult notifyExternalInviteFromMember(String senderStudentId, MemberExternalInviteRequest request) {
        if (senderStudentId == null || senderStudentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender required");
        }
        Member sender = memberRepository.findByStudentId(senderStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender is not a registered member"));

        enforceExternalInviteRateLimit(senderStudentId);

        String rawLabel = (request.getActorLabel() == null || request.getActorLabel().isBlank())
                ? sender.getName()
                : request.getActorLabel();
        String label = rawLabel == null ? null
                : rawLabel.length() > ACTOR_LABEL_MAX ? rawLabel.substring(0, ACTOR_LABEL_MAX) : rawLabel;

        String safeAcceptUrl = sanitizeAcceptUrl(request.getAcceptUrl(), true);

        LinkedHashSet<String> normalizedRecipients = new LinkedHashSet<>();
        int rejected = 0;
        for (String raw : request.getRecipientStudentIds()) {
            String trimmed = raw == null ? "" : raw.trim();
            if (trimmed.isEmpty() || trimmed.equals(senderStudentId)) {
                rejected += 1;
                continue;
            }
            normalizedRecipients.add(trimmed);
        }

        List<String> unknown = new ArrayList<>();
        int accepted = 0;
        for (String recipient : normalizedRecipients) {
            boolean known = memberRepository.existsByStudentId(recipient)
                    || eligibleMemberRepository.findByStudentId(recipient).isPresent();
            if (!known) {
                unknown.add(recipient);
                continue;
            }
            try {
                Notification saved = notifyExternalInvite(recipient, label, request.getMessage(), safeAcceptUrl, false);
                saved.setActorStudentId(senderStudentId);
                accepted += 1;
            } catch (ResponseStatusException ex) {
                rejected += 1;
            }
        }
        return new ExternalInviteBatchResult(accepted, unknown, rejected);
    }

    public void notifyNoticeCreated(Notice notice) {
        List<Notification> notifications = memberRepository.findAll().stream()
                .map(member -> build(
                        member.getStudentId(),
                        null,
                        Notification.Type.NOTICE_CREATED,
                        null,
                        null,
                        notice.getId(),
                        "New notice: " + notice.getTitle()
                ))
                .toList();
        notificationRepository.saveAll(notifications);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> list(String studentId) {
        return notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(studentId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public NotificationSummaryResponse summary(String studentId) {
        return new NotificationSummaryResponse(notificationRepository.countByRecipientStudentIdAndReadAtIsNull(studentId));
    }

    public NotificationResponse markRead(String studentId, Long id) {
        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!notification.getRecipientStudentId().equals(studentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (notification.getReadAt() == null) {
            notification.markRead();
        }
        return toResponse(notification);
    }

    public void markAllRead(String studentId) {
        notificationRepository.findByRecipientStudentIdAndReadAtIsNull(studentId).stream()
                .forEach(Notification::markRead);
    }

    private void createIfDifferent(String recipientStudentId,
                                   String actorStudentId,
                                   Notification.Type type,
                                   Long postId,
                                   Long commentId,
                                   Long noticeId,
                                   String message) {
        if (recipientStudentId == null || recipientStudentId.equals(actorStudentId)) {
            return;
        }
        notificationRepository.save(build(recipientStudentId, actorStudentId, type, postId, commentId, noticeId, message));
    }

    private Notification build(String recipientStudentId,
                               String actorStudentId,
                               Notification.Type type,
                               Long postId,
                               Long commentId,
                               Long noticeId,
                               String message) {
        Notification notification = new Notification();
        notification.setRecipientStudentId(recipientStudentId);
        notification.setActorStudentId(actorStudentId);
        notification.setType(type);
        notification.setPostId(postId);
        notification.setCommentId(commentId);
        notification.setNoticeId(noticeId);
        notification.setMessage(message);
        return notification;
    }

    private NotificationResponse toResponse(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType().name(),
                notification.getPostId(),
                notification.getCommentId(),
                notification.getNoticeId(),
                notification.getAcceptUrl(),
                notification.getActorLabel(),
                notification.getActorStudentId(),
                notification.getMessage(),
                notification.getReadAt() != null,
                notification.getCreatedAt()
        );
    }
}
