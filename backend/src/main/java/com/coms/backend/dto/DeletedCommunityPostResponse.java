package com.coms.backend.dto;

import java.time.LocalDateTime;

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
        LocalDateTime deletedAt
) {}
