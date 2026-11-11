package com.coms.backend.dto;

import java.time.LocalDateTime;

public record ClubProjectCommentResponse(
        Long id,
        Long parentCommentId,
        String authorName,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean editable,
        boolean deletable
) {}
