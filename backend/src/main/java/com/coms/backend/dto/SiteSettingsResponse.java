package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record SiteSettingsResponse(
        Long id,
        String semesterLabel,
        String recruitmentStatus,
        String recruitmentPeriod,
        String homeHeroTitle,
        String homeHeroCopy,
        List<ContactLink> contactLinks,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record ContactLink(String label, String href) {
    }
}
