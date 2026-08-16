package com.coms.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;

/**
 * Shared upvote/recommend toggle payload for engagement-enabled content (notices, club activities).
 * Mirrors the community vote semantics but is upvote-only: {@code 1} recommends, {@code 0} clears.
 * Boxed + @NotNull: Jackson 3 turns a missing field on a primitive into HTTP 500, and silently
 * defaulting a missing vote to 0 would clear it.
 */
public record EngagementVoteRequest(
        @NotNull @Min(0) @Max(1) Integer value
) {}
