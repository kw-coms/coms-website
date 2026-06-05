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
        String category,
        String imageUrl,
        String imageOriginalName,
        long viewCount,
        long upvotes,
        long downvotes,
        int myVote,
        boolean conceptPost,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean edited,
        boolean editable
) {}
