package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RequestPasswordResetRequest(
        @NotBlank String studentId,
        @NotBlank @Email String email
) {}
