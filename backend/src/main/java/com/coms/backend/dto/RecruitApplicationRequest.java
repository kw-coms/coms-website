package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RecruitApplicationRequest(
        @NotBlank @Size(max = 30) String name,
        @NotBlank @Pattern(regexp = "\\d{10}", message = "학번은 숫자 10자리여야 합니다.") String studentId,
        @NotBlank @Size(max = 80) String department,
        @NotBlank @Size(max = 20) String grade,
        @NotBlank @Size(max = 30) String phone,
        @NotBlank @Email @Size(max = 120) String email,
        @NotBlank @Size(max = 120) String interests,
        @NotBlank @Size(max = 1000) String motivation,
        @NotBlank @Size(max = 1000) String experience,
        @NotBlank @Size(max = 1000) String expectedActivities
) {}
