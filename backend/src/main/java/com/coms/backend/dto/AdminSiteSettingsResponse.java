package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record AdminSiteSettingsResponse(
        Long id,
        String semesterLabel,
        String recruitmentStatus,
        String recruitmentPeriod,
        String homeHeroTitle,
        String homeHeroCopy,
        List<SiteSettingsResponse.ContactLink> contactLinks,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        boolean askEnabled,
        String askInboxEmail
) {
}
