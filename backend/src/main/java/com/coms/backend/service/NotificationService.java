package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final MemberRepository memberRepository;
    private final EligibleMemberRepository eligibleMemberRepository;
    private final EmailVerificationSender mailSender;

    public NotificationService(NotificationRepository notificationRepository,
                               MemberRepository memberRepository,
                               EligibleMemberRepository eligibleMemberRepository,
                               EmailVerificationSender mailSender) {
        this.notificationRepository = notificationRepository;
        this.memberRepository = memberRepository;
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.mailSender = mailSender;
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
        if (acceptUrl == null || acceptUrl.isBlank()) {
            return null;
        }
        try {
            URI parsed = new URI(acceptUrl);
            String scheme = parsed.getScheme();
            if (scheme == null
                    || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
                    || parsed.getHost() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "acceptUrl must be an http(s) URL");
            }
            return acceptUrl;
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "acceptUrl is not a valid URL");
        }
    }

    public record ExternalInviteBatchResult(int accepted, List<String> unknown, int rejected) {}

    public ExternalInviteBatchResult notifyExternalInviteFromMember(String senderStudentId, MemberExternalInviteRequest request) {
        if (senderStudentId == null || senderStudentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender required");
        }
        Member sender = memberRepository.findByStudentId(senderStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender is not a registered member"));
        String label = (request.getActorLabel() == null || request.getActorLabel().isBlank())
                ? sender.getName()
                : request.getActorLabel();

        List<String> unknown = new ArrayList<>();
        int accepted = 0;
        int rejected = 0;
        for (String rawRecipient : new LinkedHashSet<>(request.getRecipientStudentIds())) {
            String recipient = rawRecipient == null ? "" : rawRecipient.trim();
            if (recipient.isEmpty() || recipient.equals(senderStudentId)) {
                rejected += 1;
                continue;
            }
            boolean known = memberRepository.existsByStudentId(recipient)
                    || eligibleMemberRepository.findByStudentId(recipient).isPresent();
            if (!known) {
                unknown.add(recipient);
                continue;
            }
            try {
                notifyExternalInvite(recipient, label, request.getMessage(), request.getAcceptUrl(), false);
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
                notification.getMessage(),
                notification.getReadAt() != null,
                notification.getCreatedAt()
        );
    }
}
