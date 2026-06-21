package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;

public record ClubEventVoteRequest(@NotNull Long entryId) {}
