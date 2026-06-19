package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ClubProjectResponse(
        Long id,
        String category,
        String categoryName,
        String title,
        String description,
        String eyebrow,
        String madeBy,
        String linkUrl,
        String displayUrl,
        int position,
        List<FileInfo> files,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record FileInfo(Long id, String url, String originalName, long size) {}
}
