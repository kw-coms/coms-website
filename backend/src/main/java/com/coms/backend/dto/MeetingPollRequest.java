package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * A new meeting poll. The dates and the daily window are checked further in the service
 * (range of dates, half-hour steps, start before end).
 */
public record MeetingPollRequest(
        @NotBlank @Size(max = 100) String title,
        @Size(max = 500) String description,
        @NotEmpty @Size(max = 14) List<@NotNull LocalDate> dates,
        @NotNull Integer startMinute,
        @NotNull Integer endMinute
) {
}
