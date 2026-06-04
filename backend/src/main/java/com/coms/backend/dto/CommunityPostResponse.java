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
        String imageUrl,
        String imageOriginalName,
        long viewCount,
        long upvotes,
        long downvotes,
        int myVote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean editable
) {}
