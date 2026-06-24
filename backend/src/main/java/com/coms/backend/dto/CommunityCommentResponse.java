package com.coms.backend.dto;

import java.time.LocalDateTime;

public record CommunityCommentResponse(
        Long id,
        Long postId,
        Long parentCommentId,
        int depth,
        String authorName,
        String authorTier,
        String authorTierLabel,
        String content,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean edited,
        boolean deletable
) {}
