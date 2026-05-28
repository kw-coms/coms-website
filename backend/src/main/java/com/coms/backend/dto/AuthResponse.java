package com.coms.backend.dto;

public record AuthResponse(
        String token,
        String studentId,
        String name,
        String message
) {}
