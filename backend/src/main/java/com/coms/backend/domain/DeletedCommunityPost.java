package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "deleted_community_posts", indexes = {
        @Index(name = "idx_deleted_community_posts_deleted_at", columnList = "deleted_at"),
        @Index(name = "idx_deleted_community_posts_original_post_id", columnList = "original_post_id"),
        @Index(name = "idx_deleted_community_posts_author_student_id", columnList = "author_student_id"),
        @Index(name = "idx_deleted_community_posts_deleted_by_student_id", columnList = "deleted_by_student_id")
})
public class DeletedCommunityPost {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "original_post_id", nullable = false)
    private Long originalPostId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "author_student_id", nullable = false, length = 64)
    private String authorStudentId;

    @Column(name = "author_name", nullable = false, length = 100)
    private String authorName;

    @Column(nullable = false, length = 40)
    private String category;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "original_created_at", nullable = false)
    private LocalDateTime originalCreatedAt;

    @Column(name = "original_updated_at", nullable = false)
    private LocalDateTime originalUpdatedAt;

    @Column(name = "deleted_by_student_id", nullable = false, length = 64)
    private String deletedByStudentId;

    @Column(name = "deleted_by_name", nullable = false, length = 100)
    private String deletedByName;

    @Column(name = "deleted_by_role", nullable = false, length = 40)
    private String deletedByRole;

    @Column(name = "deletion_reason", nullable = false, length = 300)
    private String deletionReason;

    @Column(name = "deleted_at", nullable = false)
    private LocalDateTime deletedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getOriginalPostId() { return originalPostId; }
    public void setOriginalPostId(Long originalPostId) { this.originalPostId = originalPostId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getAuthorStudentId() { return authorStudentId; }
    public void setAuthorStudentId(String authorStudentId) { this.authorStudentId = authorStudentId; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }
    public LocalDateTime getOriginalCreatedAt() { return originalCreatedAt; }
    public void setOriginalCreatedAt(LocalDateTime originalCreatedAt) { this.originalCreatedAt = originalCreatedAt; }
    public LocalDateTime getOriginalUpdatedAt() { return originalUpdatedAt; }
    public void setOriginalUpdatedAt(LocalDateTime originalUpdatedAt) { this.originalUpdatedAt = originalUpdatedAt; }
    public String getDeletedByStudentId() { return deletedByStudentId; }
    public void setDeletedByStudentId(String deletedByStudentId) { this.deletedByStudentId = deletedByStudentId; }
    public String getDeletedByName() { return deletedByName; }
    public void setDeletedByName(String deletedByName) { this.deletedByName = deletedByName; }
    public String getDeletedByRole() { return deletedByRole; }
    public void setDeletedByRole(String deletedByRole) { this.deletedByRole = deletedByRole; }
    public String getDeletionReason() { return deletionReason; }
    public void setDeletionReason(String deletionReason) { this.deletionReason = deletionReason; }
    public LocalDateTime getDeletedAt() { return deletedAt; }
    public void setDeletedAt(LocalDateTime deletedAt) { this.deletedAt = deletedAt; }
}
