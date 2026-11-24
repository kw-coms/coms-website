package com.coms.backend.dto;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonInclude;

public record NoticeResponse(
        Long id,
        String title,
        String content,
        String author,
        @JsonInclude(JsonInclude.Include.NON_NULL) String authorStudentId,
        boolean publicVisible,
        boolean pinned,
        String category,
        long viewCount,
        long upvotes,
        int myVote,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
