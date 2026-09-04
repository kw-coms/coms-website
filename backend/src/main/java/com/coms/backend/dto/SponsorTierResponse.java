package com.coms.backend.dto;

import java.util.List;

public record SponsorTierResponse(
        Long id,
        String name,
        String color,
        String description,
        int sortOrder,
        List<SponsorResponse> sponsors
) {
}
