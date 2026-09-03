package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SponsorTierRequest(
        @NotBlank @Size(min = 1, max = 40) String name,
        @Size(max = 16) String color,
        @Size(max = 200) String description,
        Integer sortOrder
) {
}
