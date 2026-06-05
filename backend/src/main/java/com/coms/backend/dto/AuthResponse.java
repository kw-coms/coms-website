package com.coms.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record AuthResponse(
        String token,
        String studentId,
        String name,
        String message,
        @JsonIgnore String refreshToken
) {
    public AuthResponse(String token, String studentId, String name, String message) {
        this(token, studentId, name, message, null);
    }
}
