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

    @Column(name = "email_verification_attempts", nullable = false)
    private int emailVerificationAttempts = 0;

    private String passwordResetCodeHash;

    private LocalDateTime passwordResetExpiresAt;

    @Column(name = "password_reset_attempts", nullable = false)
    private int passwordResetAttempts = 0;

    @Column(name = "token_version", nullable = false)
    private int tokenVersion = 0;

    private String department;

    // 기수 — entered at signup / editable by 회장; NOT derived from studentId
    // (편입생은 학번 연도와 기수가 다를 수 있다).
    @Column(length = 10)
    private String generation;

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

    @Column(length = 50)
    private String selectedBuiltinFontKey;

    /**
     * Ordered privilege tiers — ordinal position IS the rank, so keep the
     * declaration in ascending order of power:
     * ASSOCIATE(준회원) < USER(회원) < OFFICER(임원) < VICE_PRESIDENT(부회장)
     * < ADMIN(회장). 준회원 is identical to 회원 except below-USER gates (e.g.
     * the club-room door code).
     * Stored as a plain VARCHAR (no check constraint), so adding a tier needs
     * no migration. Spring's RoleHierarchy in SecurityConfig mirrors this.
     */
    public enum Role {
        ASSOCIATE, USER, OFFICER, VICE_PRESIDENT, ADMIN;

        /** True when this role's rank is at or above the given tier. */
        public boolean isAtLeast(Role other) {
            return ordinal() >= other.ordinal();
        }
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
    public int getEmailVerificationAttempts() { return emailVerificationAttempts; }
    public void setEmailVerificationAttempts(int emailVerificationAttempts) { this.emailVerificationAttempts = emailVerificationAttempts; }
    public int incrementEmailVerificationAttempts() { return ++this.emailVerificationAttempts; }
    public void resetEmailVerificationAttempts() { this.emailVerificationAttempts = 0; }
    public String getPasswordResetCodeHash() { return passwordResetCodeHash; }
    public void setPasswordResetCodeHash(String passwordResetCodeHash) { this.passwordResetCodeHash = passwordResetCodeHash; }
    public LocalDateTime getPasswordResetExpiresAt() { return passwordResetExpiresAt; }
    public void setPasswordResetExpiresAt(LocalDateTime passwordResetExpiresAt) { this.passwordResetExpiresAt = passwordResetExpiresAt; }
    public int getPasswordResetAttempts() { return passwordResetAttempts; }
    public void setPasswordResetAttempts(int passwordResetAttempts) { this.passwordResetAttempts = passwordResetAttempts; }
    public int incrementPasswordResetAttempts() { return ++this.passwordResetAttempts; }
    public void resetPasswordResetAttempts() { this.passwordResetAttempts = 0; }
    public int getTokenVersion() { return tokenVersion; }
    public void setTokenVersion(int tokenVersion) { this.tokenVersion = tokenVersion; }
    public int incrementTokenVersion() { return ++this.tokenVersion; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getGeneration() { return generation; }
    public void setGeneration(String generation) { this.generation = generation; }
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
    public String getSelectedBuiltinFontKey() { return selectedBuiltinFontKey; }
    public void setSelectedBuiltinFontKey(String selectedBuiltinFontKey) { this.selectedBuiltinFontKey = selectedBuiltinFontKey; }
}
