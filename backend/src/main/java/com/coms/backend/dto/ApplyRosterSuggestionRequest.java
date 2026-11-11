package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;

public record ApplyRosterSuggestionRequest(@NotNull Long memberId) {}
