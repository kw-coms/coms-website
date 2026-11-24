package com.coms.backend.dto;

import java.util.Map;

public record MemberPermissionSummary(
        String studentId,
        String name,
        String role,
        Map<String, String> overrides
) {
}
