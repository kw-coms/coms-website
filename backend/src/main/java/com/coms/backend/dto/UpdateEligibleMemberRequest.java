package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateEligibleMemberRequest(
    @NotBlank String studentId,
    @NotBlank String name,
    String phone
) {}
