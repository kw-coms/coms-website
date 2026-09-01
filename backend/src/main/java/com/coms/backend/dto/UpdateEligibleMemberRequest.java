package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateEligibleMemberRequest(
    String studentId,
    @NotBlank String name,
    String generation,
    String phone
) {}
