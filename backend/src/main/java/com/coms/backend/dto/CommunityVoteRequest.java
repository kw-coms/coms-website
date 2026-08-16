package com.coms.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;

// Boxed + @NotNull: Jackson 3 turns a missing field on a primitive into HTTP 500, and silently
// defaulting a missing vote to 0 would clear it.
public record CommunityVoteRequest(
        @NotNull @Min(-1) @Max(1) Integer value
) {}
