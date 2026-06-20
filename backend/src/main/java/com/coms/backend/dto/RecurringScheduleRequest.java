package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record RecurringScheduleRequest(
        @NotBlank @Size(max = 120) String title,
        @Size(max = 4000) String description,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        // DayOfWeek names (e.g. "MONDAY") or numeric 1-7 (Mon-Sun); validated/normalized in the service.
        @NotEmpty List<String> daysOfWeek,
        String startTime,
        String endTime,
        @Size(max = 200) String location,
        @Size(max = 40) String category
) {
}
