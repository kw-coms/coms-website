package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "role_permissions")
public class RolePermission {

    @EmbeddedId
    private RolePermissionId id;

    @Column(nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT false")
    private boolean allowed = false;

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT now()")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "updated_by", length = 30)
    private String updatedBy;

    protected RolePermission() {
    }

    public RolePermission(RolePermissionId id) {
        this.id = id;
    }

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public RolePermissionId getId() {
        return id;
    }

    public boolean isAllowed() {
        return allowed;
    }

    public void setAllowed(boolean allowed) {
        this.allowed = allowed;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String updatedBy) {
        this.updatedBy = updatedBy;
    }
}
