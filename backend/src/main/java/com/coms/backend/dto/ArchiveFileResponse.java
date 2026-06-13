package com.coms.backend.dto;

import java.time.LocalDateTime;

public record ArchiveFileResponse(
        Long id,
        String title,
        String description,
        String originalName,
        String mimeType,
        Long fileSize,
        String uploadedBy,
        String uploaderName,
        String category,
        LocalDateTime uploadedAt
) {
}
