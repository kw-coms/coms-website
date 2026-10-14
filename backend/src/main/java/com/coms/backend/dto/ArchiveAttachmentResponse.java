package com.coms.backend.dto;

public record ArchiveAttachmentResponse(
        Long id,
        String originalName,
        String mimeType,
        long fileSize,
        String contentVersion
) {}
