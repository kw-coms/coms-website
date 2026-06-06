package com.coms.backend.service;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.Notice;
import com.coms.backend.dto.NotificationResponse;
import com.coms.backend.dto.NotificationSummaryResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class NotificationService {
    private final NotificationRepository notificationRepository;
    private final MemberRepository memberRepository;

    public NotificationService(NotificationRepository notificationRepository, MemberRepository memberRepository) {
        this.notificationRepository = notificationRepository;
        this.memberRepository = memberRepository;
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

    public void clearRead(String studentId) {
        notificationRepository.deleteByRecipientStudentIdAndReadAtIsNotNull(studentId);
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
                notification.getMessage(),
                notification.getReadAt() != null,
                notification.getCreatedAt()
        );
    }
}
