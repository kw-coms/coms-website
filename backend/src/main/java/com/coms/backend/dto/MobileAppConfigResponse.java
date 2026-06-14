package com.coms.backend.dto;

public record MobileAppConfigResponse(
        String minimumSupportedVersion,
        String latestVersion,
        String updateUrl,
        String maintenanceMessage,
        boolean pushEnabled
) {}
