package com.coms.backend.dto;

public record EligibleMemberImportResponse(
        int imported,
        int skipped,
        String message
) {}
