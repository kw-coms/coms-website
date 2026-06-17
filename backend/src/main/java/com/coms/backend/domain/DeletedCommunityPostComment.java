package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "deleted_community_post_comments", indexes = {
        @Index(name = "idx_deleted_cpc_deleted_post_id", columnList = "deleted_post_id, depth, created_at"),
        @Index(name = "idx_deleted_cpc_original_comment_id", columnList = "original_comment_id")
})
public class DeletedCommunityPostComment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deleted_post_id", nullable = false)
    private Long deletedPostId;

    @Column(name = "original_comment_id", nullable = false)
    private Long originalCommentId;

    @Column(name = "original_parent_comment_id")
    private Long originalParentCommentId;

    @Column(name = "student_id", nullable = false, length = 50)
    private String studentId;

    @Column(name = "author_name", nullable = false, length = 100)
    private String authorName;

    @Column(name = "anonymous_name", length = 20)
    private String anonymousName;

    @Column(name = "ip_address", length = 80)
    private String ipAddress;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false)
    private int depth;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(nullable = false)
    private boolean edited;

    public DeletedCommunityPostComment() {}

    public DeletedCommunityPostComment(Long deletedPostId,
                                       Long originalCommentId,
                                       Long originalParentCommentId,
                                       String studentId,
                                       String authorName,
                                       String anonymousName,
                                       String ipAddress,
                                       String content,
                                       int depth,
                                       LocalDateTime createdAt,
                                       LocalDateTime updatedAt,
                                       boolean edited) {
        this.deletedPostId = deletedPostId;
        this.originalCommentId = originalCommentId;
        this.originalParentCommentId = originalParentCommentId;
        this.studentId = studentId;
        this.authorName = authorName;
        this.anonymousName = anonymousName;
        this.ipAddress = ipAddress;
        this.content = content;
        this.depth = depth;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.edited = edited;
    }

    public Long getId() { return id; }
    public Long getDeletedPostId() { return deletedPostId; }
    public Long getOriginalCommentId() { return originalCommentId; }
    public Long getOriginalParentCommentId() { return originalParentCommentId; }
    public String getStudentId() { return studentId; }
    public String getAuthorName() { return authorName; }
    public String getAnonymousName() { return anonymousName; }
    public String getIpAddress() { return ipAddress; }
    public String getContent() { return content; }
    public int getDepth() { return depth; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public boolean isEdited() { return edited; }
}
