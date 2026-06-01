package com.coms.backend.dto;

import java.time.LocalDateTime;

public record NoticeResponse(
        Long id,
        String title,
        String content,
        String author,
        boolean pinned,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
