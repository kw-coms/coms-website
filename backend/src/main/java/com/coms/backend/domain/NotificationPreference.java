package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "notification_preferences")
public class NotificationPreference {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50, unique = true)
    private String memberStudentId;

    @Column(nullable = false)
    private boolean commentOnPost = true;

    @Column(nullable = false)
    private boolean replyOnComment = true;

    @Column(nullable = false)
    private boolean noticeCreated = true;

    @Column(nullable = false)
    private boolean externalInvite = true;

    @Column(nullable = false)
    private boolean communityPostRestored = true;

    @Column(nullable = false)
    private boolean communityPostDeleted = true;

    @Column(nullable = false)
    private boolean recruitApplication = true;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public NotificationPreference() {
    }

    public NotificationPreference(String memberStudentId) {
        this.memberStudentId = memberStudentId;
    }

    /** Returns whether notifications of the given category are enabled for this member. */
    public boolean isEnabled(Notification.Type type) {
        return switch (type) {
            case COMMENT_ON_POST -> commentOnPost;
            case REPLY_ON_COMMENT -> replyOnComment;
            case NOTICE_CREATED -> noticeCreated;
            case EXTERNAL_INVITE -> externalInvite;
            case COMMUNITY_POST_RESTORED -> communityPostRestored;
            case COMMUNITY_POST_DELETED -> communityPostDeleted;
            case RECRUIT_APPLICATION -> recruitApplication;
        };
    }

    public Long getId() { return id; }
    public String getMemberStudentId() { return memberStudentId; }
    public void setMemberStudentId(String memberStudentId) { this.memberStudentId = memberStudentId; }
    public boolean isCommentOnPost() { return commentOnPost; }
    public void setCommentOnPost(boolean commentOnPost) { this.commentOnPost = commentOnPost; }
    public boolean isReplyOnComment() { return replyOnComment; }
    public void setReplyOnComment(boolean replyOnComment) { this.replyOnComment = replyOnComment; }
    public boolean isNoticeCreated() { return noticeCreated; }
    public void setNoticeCreated(boolean noticeCreated) { this.noticeCreated = noticeCreated; }
    public boolean isExternalInvite() { return externalInvite; }
    public void setExternalInvite(boolean externalInvite) { this.externalInvite = externalInvite; }
    public boolean isCommunityPostRestored() { return communityPostRestored; }
    public void setCommunityPostRestored(boolean communityPostRestored) { this.communityPostRestored = communityPostRestored; }
    public boolean isCommunityPostDeleted() { return communityPostDeleted; }
    public void setCommunityPostDeleted(boolean communityPostDeleted) { this.communityPostDeleted = communityPostDeleted; }
    public boolean isRecruitApplication() { return recruitApplication; }
    public void setRecruitApplication(boolean recruitApplication) { this.recruitApplication = recruitApplication; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void touch() { this.updatedAt = LocalDateTime.now(); }
}
