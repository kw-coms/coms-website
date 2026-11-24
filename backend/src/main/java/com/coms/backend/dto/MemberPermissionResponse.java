package com.coms.backend.dto;

import java.util.List;
import java.util.Map;

public record MemberPermissionResponse(
        String studentId,
        String name,
        String role,
        List<String> rolePermissions,
        Map<String, String> overrides,
        List<String> permissions
) {
}
