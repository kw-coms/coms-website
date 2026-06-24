package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AppCatalogRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 200) String eyebrow,
        @Size(max = 2000) String body,
        @Size(max = 2000) String href,
        Integer sortOrder
) {
}
