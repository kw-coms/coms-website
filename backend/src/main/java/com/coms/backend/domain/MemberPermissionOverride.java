package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "member_permission_overrides")
public class MemberPermissionOverride {
    public enum Effect { GRANT, REVOKE }

    @EmbeddedId
    private MemberPermissionOverrideId id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 6)
    private Effect effect;

    @Column(name = "granted_by", nullable = false, length = 255)
    private String grantedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected MemberPermissionOverride() {}

    public MemberPermissionOverride(String studentId, Permission permission, Effect effect, String grantedBy) {
        this.id = new MemberPermissionOverrideId(studentId, permission.key());
        this.effect = effect;
        this.grantedBy = grantedBy;
    }

    public MemberPermissionOverrideId getId() { return id; }
    public Effect getEffect() { return effect; }
    public String getGrantedBy() { return grantedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
