package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;

public record ClubProjectLikeRequest(@NotNull Boolean liked) {}
