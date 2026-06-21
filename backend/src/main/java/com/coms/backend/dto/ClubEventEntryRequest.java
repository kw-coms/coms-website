package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record ClubEventEntryRequest(
        @NotBlank String title,
        String authorName,
        String description
) {}
