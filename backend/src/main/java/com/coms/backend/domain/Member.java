package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "members")
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String studentId;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private boolean emailVerified = false;

    private String emailVerificationCodeHash;

    private LocalDateTime emailVerificationExpiresAt;

    private String department;

    private String phone;

    @Column(columnDefinition = "TEXT")
    private String aspiration;

    private String interests;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role = Role.USER;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime lastLoginAt;

    @Column(length = 45)
    private String lastLoginIp;

    private Long selectedFontId;

    public enum Role {
        USER, ADMIN
    }

    public Long getId() { return id; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public String getEmailVerificationCodeHash() { return emailVerificationCodeHash; }
    public void setEmailVerificationCodeHash(String emailVerificationCodeHash) { this.emailVerificationCodeHash = emailVerificationCodeHash; }
    public LocalDateTime getEmailVerificationExpiresAt() { return emailVerificationExpiresAt; }
    public void setEmailVerificationExpiresAt(LocalDateTime emailVerificationExpiresAt) { this.emailVerificationExpiresAt = emailVerificationExpiresAt; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAspiration() { return aspiration; }
    public void setAspiration(String aspiration) { this.aspiration = aspiration; }
    public String getInterests() { return interests; }
    public void setInterests(String interests) { this.interests = interests; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
    public String getLastLoginIp() { return lastLoginIp; }
    public void setLastLoginIp(String lastLoginIp) { this.lastLoginIp = lastLoginIp; }
    public Long getSelectedFontId() { return selectedFontId; }
    public void setSelectedFontId(Long selectedFontId) { this.selectedFontId = selectedFontId; }
}
