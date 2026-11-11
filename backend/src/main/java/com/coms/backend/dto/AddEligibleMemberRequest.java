package com.coms.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddEligibleMemberRequest(
        @NotBlank String name,
        String studentId,
        String admissionYear,
        String generation,
        String phone,
        @Size(max = 100) String department,
        @Email @Size(max = 255) String email
) {}
