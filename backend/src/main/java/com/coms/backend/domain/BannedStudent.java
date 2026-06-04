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

    public BannedStudent() {}

    public BannedStudent(String studentId) {
        this.studentId = studentId;
    }

    public Long getId() { return id; }
    public String getStudentId() { return studentId; }
    public LocalDateTime getBannedAt() { return bannedAt; }
}
