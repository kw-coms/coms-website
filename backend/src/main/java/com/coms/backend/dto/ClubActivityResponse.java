package com.coms.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ClubActivityResponse(
        Long id,
        String kind,
        String category,
        String title,
        String description,
        LocalDate eventDate,
        String imageUrl,
        String imageOriginalName,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
