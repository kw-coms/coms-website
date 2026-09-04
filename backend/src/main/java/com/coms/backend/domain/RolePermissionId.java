package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class RolePermissionId implements Serializable {

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Member.Role role;

    @Convert(converter = Permission.KeyConverter.class)
    @Column(nullable = false, length = 60)
    private Permission permission;

    protected RolePermissionId() {
    }

    public RolePermissionId(Member.Role role, Permission permission) {
        this.role = role;
        this.permission = permission;
    }

    public Member.Role getRole() {
        return role;
    }

    public Permission getPermission() {
        return permission;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof RolePermissionId that)) {
            return false;
        }
        return role == that.role && permission == that.permission;
    }

    @Override
    public int hashCode() {
        return Objects.hash(role, permission);
    }
}
