package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RecruitApplicationRequest(
        @NotBlank @Size(max = 30) String name,
        @NotBlank @Pattern(regexp = "\\d{10}") String studentId,
        @NotBlank @Size(max = 80) String department,
        @Size(max = 50) String grade,
        @NotBlank @Size(max = 30) String phone,
        @NotBlank @Email @Size(max = 120) String email,
        @Size(max = 12) List<@Size(max = 100) String> interests,
        @NotBlank @Size(max = 1000) String motive,
        @Size(max = 1000) String experience,
        @NotBlank @Size(max = 1000) String expectation
) {
}
