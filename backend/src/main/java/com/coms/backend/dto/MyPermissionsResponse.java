package com.coms.backend.dto;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Permission;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

public record MyPermissionsResponse(
        String role,
        List<String> permissions
) {
    public static MyPermissionsResponse from(Member member, Set<Permission> permissions) {
        return new MyPermissionsResponse(
                member.getRole().name(),
                permissions.stream()
                        .sorted(Comparator.comparingInt(Enum::ordinal))
                        .map(Permission::key)
                        .toList()
        );
    }
}
