package com.coms.backend.dto;

public record RecurringScheduleExceptionRequest(
        boolean canceled,
        String startTime,
        String endTime
) {
}
