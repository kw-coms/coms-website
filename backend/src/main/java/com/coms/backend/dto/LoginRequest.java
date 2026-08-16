package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String identifier,
        @NotBlank String password,
        Boolean rememberMe
) {
    public LoginRequest {
        // Older cached clients omit rememberMe; Jackson 3 maps a missing/null value onto a
        // primitive boolean as HTTP 500, so keep the component boxed and default it here.
        rememberMe = rememberMe != null && rememberMe;
    }
}
