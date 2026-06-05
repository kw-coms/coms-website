package com.coms.backend.dto;

import java.time.LocalDateTime;

public record LoginAuditResponse(
        Long id,
        String studentId,
        String name,
        String role,
        LocalDateTime lastLoginAt,
        String lastLoginIp
) {
}
