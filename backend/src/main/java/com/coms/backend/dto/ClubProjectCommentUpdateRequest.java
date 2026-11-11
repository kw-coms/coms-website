package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ClubProjectCommentUpdateRequest(@NotBlank @Size(max = 1000) String content) {}
