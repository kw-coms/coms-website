package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * One issued refresh token. A login starts a {@code family} (its first token's {@code jti}); every
 * rotation revokes the current row and inserts a new one carrying the same family. Presenting an
 * already-rotated token means the token leaked, so the whole family is revoked (reuse detection).
 *
 * <p>Logout revokes only the family of the calling device, which is what makes per-session logout
 * possible without bumping {@code Member.tokenVersion} (that still exists, and still kills every
 * device, for password changes and admin actions).
 */
@Entity
@Table(name = "refresh_sessions", indexes = {
        @Index(name = "idx_refresh_sessions_jti", columnList = "jti", unique = true),
        @Index(name = "idx_refresh_sessions_family", columnList = "family"),
        @Index(name = "idx_refresh_sessions_student_id", columnList = "student_id"),
        @Index(name = "idx_refresh_sessions_expires_at", columnList = "expires_at")
})
public class RefreshSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String jti;

    @Column(nullable = false, length = 64)
    private String family;

    @Column(nullable = false, length = 32)
    private String studentId;

    // columnDefinition carries the DEFAULT so a hibernate-generated schema matches the
    // migration and V86 can be replayed on top of it (see LatestMigrationsSmokeTest).
    @Column(nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT FALSE")
    private boolean rememberMe;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    private LocalDateTime revokedAt;

    @Column(length = 64)
    private String replacedBy;

    @Column(nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT now()")
    private LocalDateTime createdAt = LocalDateTime.now();

    public RefreshSession() {}

    public RefreshSession(String jti, String family, String studentId, boolean rememberMe, LocalDateTime expiresAt) {
        this.jti = jti;
        this.family = family;
        this.studentId = studentId;
        this.rememberMe = rememberMe;
        this.expiresAt = expiresAt;
    }

    public Long getId() { return id; }
    public String getJti() { return jti; }
    public String getFamily() { return family; }
    public String getStudentId() { return studentId; }
    public boolean isRememberMe() { return rememberMe; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
    public String getReplacedBy() { return replacedBy; }
    public void setReplacedBy(String replacedBy) { this.replacedBy = replacedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
