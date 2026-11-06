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
    @Column(name = "uploader_id", nullable = false)
    private Long uploaderId;
    @Column(name = "owner_id")
    private Long ownerId;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "attached_at")
    private LocalDateTime attachedAt;

    protected RichBodyMedia() {}
    public RichBodyMedia(Kind kind, Scope scope, String storedName, String originalName, String contentType, long sizeBytes, Long uploaderId) {
        this.kind = kind; this.scope = scope; this.storedName = storedName; this.originalName = originalName;
        this.contentType = contentType; this.sizeBytes = sizeBytes; this.uploaderId = uploaderId;
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
    public void attach(Long ownerId, LocalDateTime now) { this.ownerId = ownerId; this.attachedAt = now; }
    public void detach() { this.ownerId = null; this.attachedAt = null; }
}
