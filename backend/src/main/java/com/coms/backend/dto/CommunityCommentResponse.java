package com.coms.backend.dto;

import java.time.LocalDateTime;

public record CommunityCommentResponse(
        Long id,
        Long postId,
        String authorName,
        String content,
        LocalDateTime createdAt,
        boolean deletable
) {}
