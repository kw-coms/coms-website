package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "pending_signups")
public class PendingSignup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "eligible_member_id", nullable = false)
    private EligibleMember eligibleMember;

    @Column(nullable = false, length = 64)
    private String studentId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String verificationCodeHash;

    @Column(nullable = false)
    private LocalDateTime codeExpiresAt;

    @Column(nullable = false)
    private int verificationAttempts = 0;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(length = 100)
    private String department;

    @Column(length = 10)
    private String generation;

    @Column(length = 30)
    private String phone;

    @Column(columnDefinition = "TEXT")
    private String aspiration;

    @Column(length = 500)
    private String interests;

    @Column(nullable = false, length = 20)
    private String signupType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Member.Role initialRole = Member.Role.USER;

    @PrePersist
    void setExpiryDefaults() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (expiresAt == null) {
            expiresAt = createdAt.plusHours(24);
        }
    }

    public UUID getId() { return id; }
    public EligibleMember getEligibleMember() { return eligibleMember; }
    public void setEligibleMember(EligibleMember eligibleMember) { this.eligibleMember = eligibleMember; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getVerificationCodeHash() { return verificationCodeHash; }
    public void setVerificationCodeHash(String verificationCodeHash) { this.verificationCodeHash = verificationCodeHash; }
    public LocalDateTime getCodeExpiresAt() { return codeExpiresAt; }
    public void setCodeExpiresAt(LocalDateTime codeExpiresAt) { this.codeExpiresAt = codeExpiresAt; }
    public int getVerificationAttempts() { return verificationAttempts; }
    public void setVerificationAttempts(int verificationAttempts) { this.verificationAttempts = verificationAttempts; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
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
    public String getSignupType() { return signupType; }
    public void setSignupType(String signupType) { this.signupType = signupType; }
    public Member.Role getInitialRole() { return initialRole; }
    public void setInitialRole(Member.Role initialRole) { this.initialRole = initialRole; }
}
