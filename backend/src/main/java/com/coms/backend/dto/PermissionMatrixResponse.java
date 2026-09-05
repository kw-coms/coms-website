package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record PermissionMatrixResponse(
        List<String> roles,
        List<PermissionDescriptor> permissions,
        Map<String, List<String>> allowed,
        LocalDateTime updatedAt,
        String updatedBy
) {
    public record PermissionDescriptor(
            String key,
            String label,
            String description
    ) {
    }
}
