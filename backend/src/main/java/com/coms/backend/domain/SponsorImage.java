package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 후원자 로고 / 페이지 배너 이미지. Rows are immutable once written — the stored key,
 * the sniffed mime and the dimensions never change — which is what lets the public
 * GET serve them with a one-year immutable cache header.
 */
@Entity
@Table(name = "sponsor_images")
public class SponsorImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(nullable = false, length = 60, columnDefinition = "VARCHAR(60) NOT NULL DEFAULT 'image/png'")
    private String mime = "image/png";

    @Column(name = "size_bytes", nullable = false, columnDefinition = "BIGINT NOT NULL DEFAULT 0")
    private long sizeBytes = 0L;

    private Integer width;

    private Integer height;

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public String getStorageKey() { return storageKey; }
    public void setStorageKey(String storageKey) { this.storageKey = storageKey; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }
    public String getMime() { return mime; }
    public void setMime(String mime) { this.mime = mime; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public Integer getWidth() { return width; }
    public void setWidth(Integer width) { this.width = width; }
    public Integer getHeight() { return height; }
    public void setHeight(Integer height) { this.height = height; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
