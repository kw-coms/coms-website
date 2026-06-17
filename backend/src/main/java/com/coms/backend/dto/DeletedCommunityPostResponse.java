package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record DeletedCommunityPostResponse(
        Long id,
        Long originalPostId,
        String title,
        String content,
        String authorStudentId,
        String authorName,
        String category,
        long viewCount,
        LocalDateTime originalCreatedAt,
        LocalDateTime originalUpdatedAt,
        String deletedByStudentId,
        String deletedByName,
        String deletedByRole,
        String deletionReason,
        LocalDateTime deletedAt,
        List<ImageInfo> imageInfos,
        Long restoredPostId,
        String restoredByStudentId,
        String restoredByName,
        LocalDateTime restoredAt
) {
    public record ImageInfo(Long id, Long originalImageId, String kind, String url, String originalName) {}
}
