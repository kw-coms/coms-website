package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "rich_body_media")
public class RichBodyMedia {
    public enum Kind { IMAGE, VIDEO, FILE }
    public enum Scope { NOTICE, ARCHIVE, SPONSOR }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Kind kind;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Scope scope;
    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;
    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;
    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;
    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;
    @Column(name = "uploader_id")
    private Long uploaderId;
    @Column(name = "owner_id")
    private Long ownerId;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    @Column(name = "attached_at")
    private LocalDateTime attachedAt;
    @Column(name = "detached_at")
    private LocalDateTime detachedAt;
    @Column(name = "detached_from_owner_id")
    private Long detachedFromOwnerId;
    @Column(name = "detached_by_id")
    private Long detachedById;

    protected RichBodyMedia() {}
    public RichBodyMedia(Kind kind, Scope scope, String storedName, String originalName, String contentType, long sizeBytes, Long uploaderId, LocalDateTime createdAt) {
        this.kind = kind; this.scope = scope; this.storedName = storedName; this.originalName = originalName;
        this.contentType = contentType; this.sizeBytes = sizeBytes; this.uploaderId = uploaderId;
        this.createdAt = createdAt;
    }
    public Long getId() { return id; }
    public Kind getKind() { return kind; }
    public Scope getScope() { return scope; }
    public String getStoredName() { return storedName; }
    public String getOriginalName() { return originalName; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public Long getUploaderId() { return uploaderId; }
    public Long getOwnerId() { return ownerId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getAttachedAt() { return attachedAt; }
    public LocalDateTime getDetachedAt() { return detachedAt; }
    public Long getDetachedFromOwnerId() { return detachedFromOwnerId; }
    public Long getDetachedById() { return detachedById; }
    public void attach(Long ownerId, LocalDateTime now) {
        this.ownerId = ownerId; this.attachedAt = now; this.detachedAt = null;
        this.detachedFromOwnerId = null; this.detachedById = null;
    }
    /** @param detachedById acting member, or null when there is no actor (not charged to anyone's quota). */
    public void detach(LocalDateTime now, Long detachedById) {
        this.detachedFromOwnerId = this.ownerId; this.detachedById = detachedById;
        this.ownerId = null; this.attachedAt = null; this.detachedAt = now;
    }
    public void detach(LocalDateTime now) { detach(now, null); }
}
