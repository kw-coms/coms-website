package com.coms.backend.dto;

import java.time.LocalDateTime;

public record DeletedCommunityPostAppealResponse(
        Long id,
        Long deletedPostId,
        String requesterStudentId,
        String requesterName,
        String message,
        String status,
        LocalDateTime createdAt,
        LocalDateTime resolvedAt,
        String resolutionNote
) {}
