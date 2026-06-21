package com.coms.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Admin-facing view of a recurring schedule definition (used by the management UI).
 */
public record RecurringScheduleResponse(
        Long id,
        String title,
        String description,
        LocalDate startDate,
        LocalDate endDate,
        List<String> daysOfWeek,
        String startTime,
        String endTime,
        String location,
        String category,
        String categoryName,
        String colorHex,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
