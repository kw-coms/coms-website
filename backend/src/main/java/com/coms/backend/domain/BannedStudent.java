package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "banned_students")
public class BannedStudent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", unique = true, nullable = false)
    private String studentId;

    @Column(name = "banned_at", nullable = false)
    private LocalDateTime bannedAt = LocalDateTime.now();

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    public BannedStudent() {}

    public BannedStudent(String studentId, LocalDateTime expiresAt) {
        this.studentId = studentId;
        this.expiresAt = expiresAt;
    }

    public Long getId() { return id; }
    public String getStudentId() { return studentId; }
    public LocalDateTime getBannedAt() { return bannedAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
}
