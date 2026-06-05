package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
public class Notification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String recipientStudentId;

    @Column(length = 50)
    private String actorStudentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Type type;

    private Long postId;
    private Long commentId;
    private Long noticeId;

    @Column(nullable = false, length = 300)
    private String message;

    private LocalDateTime readAt;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum Type {
        COMMENT_ON_POST, REPLY_ON_COMMENT, NOTICE_CREATED
    }

    public Long getId() { return id; }
    public String getRecipientStudentId() { return recipientStudentId; }
    public void setRecipientStudentId(String recipientStudentId) { this.recipientStudentId = recipientStudentId; }
    public String getActorStudentId() { return actorStudentId; }
    public void setActorStudentId(String actorStudentId) { this.actorStudentId = actorStudentId; }
    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public Long getPostId() { return postId; }
    public void setPostId(Long postId) { this.postId = postId; }
    public Long getCommentId() { return commentId; }
    public void setCommentId(Long commentId) { this.commentId = commentId; }
    public Long getNoticeId() { return noticeId; }
    public void setNoticeId(Long noticeId) { this.noticeId = noticeId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getReadAt() { return readAt; }
    public void markRead() { this.readAt = LocalDateTime.now(); }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
