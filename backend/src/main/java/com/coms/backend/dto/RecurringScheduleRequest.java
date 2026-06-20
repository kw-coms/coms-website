package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
        @Size(max = 40) String category,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "색상은 #RRGGBB 형식이어야 합니다.")
        String colorHex
) {
        public RecurringScheduleRequest(
                String title,
                String description,
                LocalDate startDate,
                LocalDate endDate,
                List<String> daysOfWeek,
                String startTime,
                String endTime,
                String location,
                String category
        ) {
                this(title, description, startDate, endDate, daysOfWeek, startTime, endTime, location, category, null);
        }
}
