package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "club_event_entries")
public class ClubEventEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_event_id", nullable = false)
    private Long clubEventId;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(name = "author_name", length = 100)
    private String authorName;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getClubEventId() { return clubEventId; }
    public void setClubEventId(Long clubEventId) { this.clubEventId = clubEventId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    public long getFileSize() { return fileSize; }
    public void setFileSize(long fileSize) { this.fileSize = fileSize; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
