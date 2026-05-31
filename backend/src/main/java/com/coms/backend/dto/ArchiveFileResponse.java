package com.coms.backend.dto;

import java.time.LocalDateTime;

public record ArchiveFileResponse(
        Long id,
        String originalName,
        String mimeType,
        Long fileSize,
        String uploadedBy,
        LocalDateTime uploadedAt
) {
}
