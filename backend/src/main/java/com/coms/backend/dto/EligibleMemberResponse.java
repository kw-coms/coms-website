package com.coms.backend.dto;

public record EligibleMemberResponse(
    Long id,
    String studentId,
    String name,
    String generation
) {}
