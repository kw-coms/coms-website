package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "login_failures")
public class LoginFailure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 50)
    private String studentId;

    @Column(length = 45)
    private String ip;

    @Column(nullable = false)
    private LocalDateTime attemptedAt = LocalDateTime.now();

    public LoginFailure() {}

    public LoginFailure(String studentId, String ip) {
        this.studentId = studentId;
        this.ip = ip;
    }

    public Long getId() { return id; }
    public String getStudentId() { return studentId; }
    public String getIp() { return ip; }
    public LocalDateTime getAttemptedAt() { return attemptedAt; }
}
