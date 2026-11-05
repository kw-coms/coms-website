package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateEligibleMemberRequest(
    String studentId,
    @NotBlank String name,
    String generation,
    String phone,
    @Size(max = 100) String department
) {}
