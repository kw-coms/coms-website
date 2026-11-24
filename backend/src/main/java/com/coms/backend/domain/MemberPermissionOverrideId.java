package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;

@Embeddable
public record MemberPermissionOverrideId(
        @Column(name = "student_id", nullable = false, length = 255) String studentId,
        @Column(name = "permission_key", nullable = false, length = 60) String permissionKey
) implements Serializable {
}
