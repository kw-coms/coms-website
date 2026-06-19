package com.coms.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

/**
 * Shared upvote/recommend toggle payload for engagement-enabled content (notices, club activities).
 * Mirrors the community vote semantics but is upvote-only: {@code 1} recommends, {@code 0} clears.
 */
public record EngagementVoteRequest(
        @Min(0) @Max(1) int value
) {}
