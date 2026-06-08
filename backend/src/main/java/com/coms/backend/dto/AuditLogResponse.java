package com.coms.backend.dto;

import java.time.LocalDateTime;

public record AuditLogResponse(
        Long id,
        String actorStudentId,
        String actorName,
        String action,
        String targetType,
        String targetId,
        String detail,
        String ipAddress,
        LocalDateTime createdAt
) {}
