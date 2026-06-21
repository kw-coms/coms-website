package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

public record ClubEventRequest(
        @NotBlank String title,
        String description,
        @NotNull LocalDateTime startsAt,
        @NotNull LocalDateTime endsAt
) {}
