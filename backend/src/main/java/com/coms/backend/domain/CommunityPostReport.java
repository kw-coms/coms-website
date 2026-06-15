package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "community_post_reports")
public class CommunityPostReport {

    public enum Status { OPEN, ACCEPTED, REJECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(name = "reporter_student_id", nullable = false, length = 64)
    private String reporterStudentId;

    @Column(nullable = false, length = 64)
    private String reason;

    @Column(length = 500)
    private String detail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.OPEN;

    @Column(name = "resolved_by_student_id", length = 64)
    private String resolvedByStudentId;

    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    public Long getId() { return id; }
    public Long getPostId() { return postId; }
    public void setPostId(Long postId) { this.postId = postId; }
    public String getReporterStudentId() { return reporterStudentId; }
    public void setReporterStudentId(String reporterStudentId) { this.reporterStudentId = reporterStudentId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getResolvedByStudentId() { return resolvedByStudentId; }
    public void setResolvedByStudentId(String resolvedByStudentId) { this.resolvedByStudentId = resolvedByStudentId; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
}
