package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "deleted_community_post_appeals", indexes = {
        @Index(name = "idx_deleted_post_appeals_deleted_post_id", columnList = "deleted_post_id"),
        @Index(name = "idx_deleted_post_appeals_requester", columnList = "requester_student_id"),
        @Index(name = "idx_deleted_post_appeals_status", columnList = "status")
})
public class DeletedCommunityPostAppeal {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deleted_post_id", nullable = false)
    private Long deletedPostId;

    @Column(name = "requester_student_id", nullable = false, length = 64)
    private String requesterStudentId;

    @Column(name = "requester_name", nullable = false, length = 100)
    private String requesterName;

    @Column(nullable = false, length = 500)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.OPEN;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "resolved_by_student_id", length = 64)
    private String resolvedByStudentId;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    public enum Status {
        OPEN, RESOLVED
    }

    public Long getId() { return id; }
    public Long getDeletedPostId() { return deletedPostId; }
    public void setDeletedPostId(Long deletedPostId) { this.deletedPostId = deletedPostId; }
    public String getRequesterStudentId() { return requesterStudentId; }
    public void setRequesterStudentId(String requesterStudentId) { this.requesterStudentId = requesterStudentId; }
    public String getRequesterName() { return requesterName; }
    public void setRequesterName(String requesterName) { this.requesterName = requesterName; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getResolvedByStudentId() { return resolvedByStudentId; }
    public void setResolvedByStudentId(String resolvedByStudentId) { this.resolvedByStudentId = resolvedByStudentId; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
}
