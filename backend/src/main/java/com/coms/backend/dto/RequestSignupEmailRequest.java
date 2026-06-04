package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record RequestSignupEmailRequest(@NotBlank String studentId) {}
