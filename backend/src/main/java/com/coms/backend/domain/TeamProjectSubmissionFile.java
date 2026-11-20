package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "team_project_submission_files")
public class TeamProjectSubmissionFile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "submission_id", nullable = false)
    private Long submissionId;
    @Column(name = "original_name", nullable = false)
    private String originalName;
    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;
    @Column(name = "file_size", nullable = false)
    private Long fileSize;
    @Column(name = "stored_name", nullable = false)
    private String storedName;
    @Column(name = "uploaded_by", nullable = false)
    private String uploadedBy;
    @Column(name = "uploaded_at", nullable = false)
    private LocalDateTime uploadedAt;

    public Long getId() { return id; }
    public Long getSubmissionId() { return submissionId; }
    public void setSubmissionId(Long value) { submissionId = value; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String value) { originalName = value; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String value) { mimeType = value; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long value) { fileSize = value; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String value) { storedName = value; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String value) { uploadedBy = value; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime value) { uploadedAt = value; }
}
