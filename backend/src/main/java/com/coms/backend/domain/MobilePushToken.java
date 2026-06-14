package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(name = "mobile_push_tokens",
        indexes = {
                @Index(name = "idx_mobile_push_tokens_member", columnList = "member_student_id"),
                @Index(name = "idx_mobile_push_tokens_updated", columnList = "updated_at")
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_mobile_push_tokens_token", columnNames = "token")
        })
public class MobilePushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_student_id", nullable = false, length = 32)
    private String memberStudentId;

    @Column(nullable = false, length = 1024)
    private String token;

    @Column(length = 64)
    private String platform;

    @Column(name = "device_id", length = 128)
    private String deviceId;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public String getMemberStudentId() { return memberStudentId; }
    public void setMemberStudentId(String memberStudentId) { this.memberStudentId = memberStudentId; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
