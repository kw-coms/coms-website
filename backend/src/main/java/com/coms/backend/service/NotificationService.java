package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.NotificationPreference;
import com.coms.backend.domain.Notice;
import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.dto.NotificationPreferencesRequest;
import com.coms.backend.dto.NotificationPreferencesResponse;
import com.coms.backend.dto.NotificationResponse;
import com.coms.backend.dto.NotificationSummaryResponse;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationPreferenceRepository;
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
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Transactional
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final int ACTOR_LABEL_MAX = 100;
    private static final int MAX_EXTERNAL_INVITES_PER_MINUTE = 10;
    private static final int MAX_EXTERNAL_INVITES_PER_DAY = 200;
    // Per-sender sliding window mirroring RecruitApplicationService.enforceRateLimit: bounds how
    // many invite batches a single member can fire over a 10-minute window (defense against
    // sustained abuse, complementing the tighter per-minute/per-day DB caps above), and each
    // batch is capped so one request cannot fan out to an unbounded recipient list.
    private static final int MAX_INVITE_BATCHES_PER_WINDOW = 30;
    private static final Duration INVITE_RATE_LIMIT_WINDOW = Duration.ofMinutes(10);
    private static final int MAX_INVITE_RECIPIENTS_PER_BATCH = 20;

    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final MemberRepository memberRepository;
    private final EligibleMemberRepository eligibleMemberRepository;
    private final EmailVerificationSender mailSender;
    private final PushNotificationSender pushNotificationSender;
    private final Set<String> acceptUrlAllowedHosts;
    private final Map<String, Deque<LocalDateTime>> inviteAttemptsBySender = new ConcurrentHashMap<>();

    public NotificationService(NotificationRepository notificationRepository,
                               NotificationPreferenceRepository notificationPreferenceRepository,
                               MemberRepository memberRepository,
                               EligibleMemberRepository eligibleMemberRepository,
                               EmailVerificationSender mailSender,
                               PushNotificationSender pushNotificationSender,
                               @Value("${notification.external-invite.allowed-hosts:coms.kw.ac.kr}") String allowedHosts) {
        this.notificationRepository = notificationRepository;
        this.notificationPreferenceRepository = notificationPreferenceRepository;
        this.memberRepository = memberRepository;
        this.eligibleMemberRepository = eligibleMemberRepository;
        this.mailSender = mailSender;
        this.pushNotificationSender = pushNotificationSender;
        this.acceptUrlAllowedHosts = parseAllowedHosts(allowedHosts);
    }

    /**
     * Whether the recipient has the given notification category enabled. Defaults to true
     * (all categories on) for members who have never saved preferences, so existing behavior
     * is unchanged until a member explicitly opts out.
     */
    @Transactional(readOnly = true)
    public boolean isCategoryEnabled(String recipientStudentId, Notification.Type type) {
        if (recipientStudentId == null || recipientStudentId.isBlank()) {
            return true;
        }
        return notificationPreferenceRepository.findByMemberStudentId(recipientStudentId)
                .map(preference -> preference.isEnabled(type))
                .orElse(true);
    }

    @Transactional(readOnly = true)
    public NotificationPreferencesResponse getPreferences(String memberStudentId) {
        return notificationPreferenceRepository.findByMemberStudentId(memberStudentId)
                .map(NotificationPreferencesResponse::from)
                .orElseGet(() -> NotificationPreferencesResponse.from(new NotificationPreference(memberStudentId)));
    }

    public NotificationPreferencesResponse updatePreferences(String memberStudentId, NotificationPreferencesRequest request) {
        if (memberStudentId == null || memberStudentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Member required");
        }
        NotificationPreference preference = notificationPreferenceRepository.findByMemberStudentId(memberStudentId)
                .orElseGet(() -> new NotificationPreference(memberStudentId));
        preference.setCommentOnPost(request.commentOnPost());
        preference.setReplyOnComment(request.replyOnComment());
        preference.setNoticeCreated(request.noticeCreated());
        preference.setExternalInvite(request.externalInvite());
        preference.setCommunityPostRestored(request.communityPostRestored());
        preference.setCommunityPostDeleted(request.communityPostDeleted());
        preference.setRecruitApplication(request.recruitApplication());
        preference.touch();
        return NotificationPreferencesResponse.from(notificationPreferenceRepository.save(preference));
    }

    /**
     * Best-effort FCM push. Wraps the sender (which itself never throws) in an extra guard so a
     * push failure can never break the in-app notification transaction.
     */
    private void sendPush(String recipientStudentId, String title, String body, Map<String, String> data) {
        if (recipientStudentId == null || recipientStudentId.isBlank()) {
            return;
        }
        try {
            pushNotificationSender.sendToMember(recipientStudentId, title, body, data);
        } catch (RuntimeException e) {
            log.warn("Push dispatch to {} failed (ignored)", recipientStudentId, e);
        }
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
        String message = comment.getAuthorName() + " commented on your post.";
        createIfDifferent(
                post.getAuthorStudentId(),
                comment.getStudentId(),
                Notification.Type.COMMENT_ON_POST,
                post.getId(),
                comment.getId(),
                null,
                message
        );
        if (post.getAuthorStudentId() != null && !post.getAuthorStudentId().equals(comment.getStudentId())) {
            sendPush(post.getAuthorStudentId(), "새 댓글", message,
                    Map.of("type", "COMMENT_ON_POST", "postId", String.valueOf(post.getId())));
        }
    }

    public void notifyCommentReply(CommunityPost post, CommunityComment parent, CommunityComment reply) {
        String message = reply.getAuthorName() + " replied to your comment.";
        createIfDifferent(
                parent.getStudentId(),
                reply.getStudentId(),
                Notification.Type.REPLY_ON_COMMENT,
                post.getId(),
                reply.getId(),
                null,
                message
        );
        if (parent.getStudentId() != null && !parent.getStudentId().equals(reply.getStudentId())) {
            sendPush(parent.getStudentId(), "새 답글", message,
                    Map.of("type", "REPLY_ON_COMMENT", "postId", String.valueOf(post.getId())));
        }
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

    // Per-sender sliding window, mirroring RecruitApplicationService.enforceRateLimit: caps how
    // many invite batches a single member can fire within the window and purges expired senders
    // so the in-memory map cannot leak memory.
    private void enforceInviteBatchRateLimit(String senderStudentId) {
        String key = senderStudentId == null || senderStudentId.isBlank() ? "unknown" : senderStudentId;
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minus(INVITE_RATE_LIMIT_WINDOW);
        Deque<LocalDateTime> attempts = inviteAttemptsBySender.computeIfAbsent(key, ignored -> new ArrayDeque<>());

        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= MAX_INVITE_BATCHES_PER_WINDOW) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "초대 요청이 많습니다. 잠시 후 다시 시도해주세요.");
            }
            attempts.addLast(now);
        }

        evictExpiredInviteSenders(cutoff);
    }

    // Test-support: clears the in-memory per-sender invite window so isolated tests don't
    // inherit each other's batch counts against the shared singleton service.
    void resetInviteRateLimiter() {
        inviteAttemptsBySender.clear();
    }

    private void evictExpiredInviteSenders(LocalDateTime cutoff) {
        inviteAttemptsBySender.forEach((key, attempts) -> {
            synchronized (attempts) {
                LocalDateTime last = attempts.peekLast();
                if (last == null || last.isBefore(cutoff)) {
                    inviteAttemptsBySender.remove(key, attempts);
                }
            }
        });
    }

    public record ExternalInviteBatchResult(int accepted, List<String> unknown, int rejected) {}

    public ExternalInviteBatchResult notifyExternalInviteFromMember(String senderStudentId, MemberExternalInviteRequest request) {
        if (senderStudentId == null || senderStudentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender required");
        }
        Member sender = memberRepository.findByStudentId(senderStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sender is not a registered member"));

        enforceInviteBatchRateLimit(senderStudentId);
        enforceExternalInviteRateLimit(senderStudentId);

        if (request.getRecipientStudentIds() != null
                && request.getRecipientStudentIds().size() > MAX_INVITE_RECIPIENTS_PER_BATCH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "한 번에 최대 " + MAX_INVITE_RECIPIENTS_PER_BATCH + "명까지 초대할 수 있습니다.");
        }

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
            if (!isCategoryEnabled(recipient, Notification.Type.EXTERNAL_INVITE)) {
                rejected += 1;
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

    public void notifyRecruitApplication(com.coms.backend.domain.RecruitApplication application) {
        String applicantName = application.getName() == null || application.getName().isBlank()
                ? "지원자"
                : application.getName().trim();
        String studentId = application.getStudentId() == null ? "" : application.getStudentId().trim();
        String message = studentId.isBlank()
                ? "새 지원서가 도착했습니다: " + applicantName
                : "새 지원서가 도착했습니다: " + applicantName + " (" + studentId + ")";
        List<Member> admins = memberRepository.findByRole(Member.Role.ADMIN).stream()
                .filter(admin -> isCategoryEnabled(admin.getStudentId(), Notification.Type.RECRUIT_APPLICATION))
                .toList();
        List<Notification> notifications = admins.stream()
                .map(admin -> build(
                        admin.getStudentId(),
                        null,
                        Notification.Type.RECRUIT_APPLICATION,
                        null,
                        null,
                        null,
                        message
                ))
                .toList();
        if (!notifications.isEmpty()) {
            notificationRepository.saveAll(notifications);
            for (Member admin : admins) {
                sendPush(admin.getStudentId(), "새 지원서", message,
                        Map.of("type", "RECRUIT_APPLICATION"));
            }
        }
    }

    public void notifyNoticeCreated(Notice notice) {
        String message = "New notice: " + notice.getTitle();
        List<Member> members = memberRepository.findAll().stream()
                .filter(member -> isCategoryEnabled(member.getStudentId(), Notification.Type.NOTICE_CREATED))
                .toList();
        List<Notification> notifications = members.stream()
                .map(member -> build(
                        member.getStudentId(),
                        null,
                        Notification.Type.NOTICE_CREATED,
                        null,
                        null,
                        notice.getId(),
                        message
                ))
                .toList();
        notificationRepository.saveAll(notifications);
        Map<String, String> data = Map.of("type", "NOTICE_CREATED", "noticeId", String.valueOf(notice.getId()));
        for (Member member : members) {
            sendPush(member.getStudentId(), "새 공지", message, data);
        }
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
        if (!isCategoryEnabled(recipientStudentId, type)) {
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
