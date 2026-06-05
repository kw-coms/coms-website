package com.coms.backend.dto;

import java.time.LocalDateTime;

public record NotificationResponse(
        Long id,
        String type,
        Long postId,
        Long commentId,
        Long noticeId,
        String message,
        boolean read,
        LocalDateTime createdAt
) {}
