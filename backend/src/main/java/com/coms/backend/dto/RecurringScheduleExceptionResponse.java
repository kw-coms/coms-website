package com.coms.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record RecurringScheduleExceptionResponse(
        Long id,
        Long recurringScheduleId,
        LocalDate exceptionDate,
        boolean canceled,
        String startTime,
        String endTime,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
