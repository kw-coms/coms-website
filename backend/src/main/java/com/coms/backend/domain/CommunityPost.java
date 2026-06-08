package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "community_posts")
public class CommunityPost {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false)
    private String authorStudentId;

    @Column(nullable = false)
    private String authorName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category = Category.GENERAL;

    private String imageStoredName;

    private String imageOriginalName;

    private String imageMimeType;

    @Column(nullable = false)
    private long viewCount = 0;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(nullable = false)
    private boolean edited = false;

    public void markEdited() {
        edited = true;
        updatedAt = LocalDateTime.now();
    }

    public enum Category {
        GENERAL, QUESTION, INFO, ANONYMOUS
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getAuthorStudentId() { return authorStudentId; }
    public void setAuthorStudentId(String authorStudentId) { this.authorStudentId = authorStudentId; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }
    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }
    public String getImageStoredName() { return imageStoredName; }
    public void setImageStoredName(String imageStoredName) { this.imageStoredName = imageStoredName; }
    public String getImageOriginalName() { return imageOriginalName; }
    public void setImageOriginalName(String imageOriginalName) { this.imageOriginalName = imageOriginalName; }
    public String getImageMimeType() { return imageMimeType; }
    public void setImageMimeType(String imageMimeType) { this.imageMimeType = imageMimeType; }
    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }
    public void incrementViewCount() { this.viewCount++; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public boolean isEdited() { return edited; }
}
