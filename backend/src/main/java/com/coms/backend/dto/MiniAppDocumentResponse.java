package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record MiniAppDocumentResponse(
        Long id,
        String app,
        String contentType,
        String contentId,
        String title,
        String description,
        String ownerStudentId,
        String ownerName,
        boolean shared,
        String shareSlug,
        String shareUrl,
        Map<String, Object> payload,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime sharedAt
) {
}
