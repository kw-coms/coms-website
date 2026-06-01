package com.coms.backend.dto;

public record MemberResponse(
        Long id,
        String studentId,
        String name,
        String email,
        String department,
        String phone,
        String role
) {
}
