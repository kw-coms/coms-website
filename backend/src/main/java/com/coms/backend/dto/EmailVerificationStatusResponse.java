package com.coms.backend.dto;

public record EmailVerificationStatusResponse(
        String message,
        boolean emailVerified
) {}
