package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record AddEligibleMemberRequest(
        @NotBlank String name,
        String studentId,
        String admissionYear,
        String generation,
        String phone
) {}
