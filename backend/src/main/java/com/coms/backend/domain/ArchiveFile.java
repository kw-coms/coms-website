package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.JoinColumn;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "archive_files")
public class ArchiveFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false)
    private String storedName;

    @Column(nullable = false)
    private String mimeType;

    @Column(nullable = false)
    private Long fileSize;

    @Column(nullable = false)
    private String uploadedBy;

    @Column
    private String uploaderName;

    @Column
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category = Category.GENERAL;

    public enum Visibility { PUBLIC, MEMBERS, OFFICERS, SELECTED }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Visibility visibility = Visibility.MEMBERS;

    @ElementCollection
    @CollectionTable(name = "archive_file_selected_members", joinColumns = @JoinColumn(name = "archive_file_id"))
    @Column(name = "student_id", nullable = false)
    private Set<String> selectedStudentIds = new HashSet<>();

    @Column(name = "view_count", nullable = false)
    private long viewCount = 0;

    @Column(nullable = false)
    private LocalDateTime uploadedAt = LocalDateTime.now();

    public enum Category {
        GENERAL, ACADEMIC_JOURNAL
    }

    public Long getId() { return id; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String uploadedBy) { this.uploadedBy = uploadedBy; }
    public String getUploaderName() { return uploaderName; }
    public void setUploaderName(String uploaderName) { this.uploaderName = uploaderName; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }
    public Visibility getVisibility() { return visibility; }
    public void setVisibility(Visibility visibility) { this.visibility = visibility; }
    public Set<String> getSelectedStudentIds() { return selectedStudentIds; }
    public void setSelectedStudentIds(Set<String> selectedStudentIds) { this.selectedStudentIds = new HashSet<>(selectedStudentIds); }
    public boolean isVisibleTo(Member viewer) {
        if (viewer != null && viewer.getRole() == Member.Role.ADMIN) return true;
        if (visibility == Visibility.PUBLIC) return true;
        if (viewer == null) return false;
        return switch (visibility) {
            case MEMBERS -> true;
            case OFFICERS -> viewer.getRole() == Member.Role.OFFICER || viewer.getRole() == Member.Role.VICE_PRESIDENT;
            case SELECTED -> viewer.getStudentId().equals(uploadedBy) || selectedStudentIds.contains(viewer.getStudentId());
            case PUBLIC -> true;
        };
    }
    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }
    public void incrementViewCount() { this.viewCount++; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}
