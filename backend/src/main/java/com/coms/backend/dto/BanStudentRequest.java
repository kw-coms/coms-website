package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record BanStudentRequest(
        @NotBlank
        @Pattern(regexp = "\\d{10}", message = "학번은 숫자 10자리여야 합니다.")
        String studentId,

        @NotBlank
        String duration
) {}
