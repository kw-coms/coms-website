package com.coms.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

public record CommunityVoteRequest(
        @Min(-1) @Max(1) int value
) {}
