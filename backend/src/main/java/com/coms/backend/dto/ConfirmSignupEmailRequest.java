package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record ConfirmSignupEmailRequest(
        @NotBlank String studentId,
        @NotBlank String code
) {}
