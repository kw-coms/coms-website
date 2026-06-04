package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ConfirmEmailVerificationRequest(
        @NotBlank
        @Pattern(regexp = "\\d{6}", message = "인증코드는 숫자 6자리여야 합니다.")
        String code
) {}
