package com.coms.backend.dto;

public record MemberResponse(
        String studentId,
        String name,
        String email,
        String department,
        String phone,
        String role
) {
}
