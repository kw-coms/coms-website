package com.coms.backend.dto;

public record MemberResponse(
        Long id,
        String studentId,
        String name,
        String email,
        boolean emailVerified,
        String department,
        String phone,
        String role,
        String aspiration,
        String interests,
        Long selectedFontId
) {
}
