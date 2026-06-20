package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "archive_file_votes",
        uniqueConstraints = @UniqueConstraint(name = "uk_archive_file_votes_file_student", columnNames = {"archive_file_id", "student_id"})
)
public class ArchiveFileVote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "archive_file_id", nullable = false)
    private Long archiveFileId;

    @Column(name = "student_id", nullable = false)
    private String studentId;

    @Column(name = "vote_value", nullable = false)
    private int value;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getArchiveFileId() { return archiveFileId; }
    public void setArchiveFileId(Long archiveFileId) { this.archiveFileId = archiveFileId; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public int getValue() { return value; }
    public void setValue(int value) { this.value = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
