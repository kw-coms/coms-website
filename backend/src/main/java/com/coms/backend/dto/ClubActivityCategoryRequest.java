package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ClubActivityCategoryRequest(
        @Size(max = 40) String key,
        @NotBlank @Size(max = 60) String name,
        Integer position
) {
}
