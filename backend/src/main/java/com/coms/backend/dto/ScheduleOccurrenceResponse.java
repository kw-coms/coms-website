package com.coms.backend.dto;

import java.time.LocalDate;

/**
 * A single expanded occurrence of a recurring schedule on a concrete date,
 * rendered on the monthly calendar alongside one-off SCHEDULE activities.
 */
public record ScheduleOccurrenceResponse(
        Long recurringScheduleId,
        String title,
        String description,
        LocalDate date,
        String startTime,
        String endTime,
        String location,
        String category,
        String categoryName,
        boolean recurring
) {
}
