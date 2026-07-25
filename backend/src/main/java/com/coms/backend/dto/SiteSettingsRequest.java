package com.coms.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SiteSettingsRequest(
        @NotBlank @Size(max = 120) String semesterLabel,
        @NotBlank @Size(max = 120) String recruitmentStatus,
        @NotBlank @Size(max = 240) String recruitmentPeriod,
        @NotBlank @Size(max = 120) String homeHeroTitle,
        @NotBlank @Size(max = 500) String homeHeroCopy,
        @Valid @Size(max = 5) List<ContactLinkRequest> contactLinks
) {
    public record ContactLinkRequest(
            @NotBlank @Size(max = 80) String label,
            @NotBlank @Size(max = 240) String href
    ) {
    }
}
