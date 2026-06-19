package com.coms.backend.dto;

import java.time.LocalDateTime;

public record NoticeResponse(
        Long id,
        String title,
        String content,
        String author,
        boolean pinned,
        String category,
        long viewCount,
        long upvotes,
        int myVote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
