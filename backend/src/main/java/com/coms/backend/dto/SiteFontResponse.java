package com.coms.backend.dto;

import java.time.LocalDateTime;

public record SiteFontResponse(
        Long id,
        String name,
        String fileUrl,
        boolean active,
        LocalDateTime createdAt
) {}
