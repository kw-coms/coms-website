package com.coms.backend.dto;

import java.time.LocalDateTime;

public record CommunityPostResponse(
        Long id,
        String title,
        String content,
        String authorStudentId,
        String authorName,
        String authorDisplayName,
        boolean authorAdmin,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean editable
) {}
