package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CommunityPollVoteRequest(
        @NotBlank String pollId,
        @NotNull Integer optionIndex
) {}
