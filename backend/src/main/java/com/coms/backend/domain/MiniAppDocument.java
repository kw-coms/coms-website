package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "mini_app_documents",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_mini_app_document_owner_content", columnNames = {"app", "content_type", "owner_student_id", "content_id"}),
                @UniqueConstraint(name = "uk_mini_app_document_share_slug", columnNames = {"share_slug"})
        },
        indexes = {
                @Index(name = "idx_mini_app_documents_owner_updated", columnList = "app, owner_student_id, updated_at"),
                @Index(name = "idx_mini_app_documents_shared", columnList = "app, shared, shared_at")
        }
)
public class MiniAppDocument {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String app;

    @Column(name = "content_type", nullable = false, length = 30)
    private String contentType;

    @Column(name = "content_id", nullable = false, length = 120)
    private String contentId;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 500)
    private String description;

    @Column(name = "owner_student_id", nullable = false, length = 50)
    private String ownerStudentId;

    @Column(name = "owner_name", length = 100)
    private String ownerName;

    @Column(nullable = false)
    private boolean shared = false;

    @Column(name = "share_slug", length = 80)
    private String shareSlug;

    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson = "{}";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "shared_at")
    private LocalDateTime sharedAt;

    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getApp() { return app; }
    public void setApp(String app) { this.app = app; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public String getContentId() { return contentId; }
    public void setContentId(String contentId) { this.contentId = contentId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getOwnerStudentId() { return ownerStudentId; }
    public void setOwnerStudentId(String ownerStudentId) { this.ownerStudentId = ownerStudentId; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public boolean isShared() { return shared; }
    public void setShared(boolean shared) { this.shared = shared; }
    public String getShareSlug() { return shareSlug; }
    public void setShareSlug(String shareSlug) { this.shareSlug = shareSlug; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public LocalDateTime getSharedAt() { return sharedAt; }
    public void setSharedAt(LocalDateTime sharedAt) { this.sharedAt = sharedAt; }
}
