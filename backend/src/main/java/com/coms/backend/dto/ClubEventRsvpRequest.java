package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;

public record ClubEventRsvpRequest(@NotNull String status) {}
