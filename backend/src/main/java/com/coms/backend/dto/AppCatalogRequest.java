package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AppCatalogRequest(
        // Widths of app_catalog_entries (V59): title 120, eyebrow 60, href 500; body is TEXT.
        @NotBlank @Size(max = 120) String title,
        @Size(max = 60) String eyebrow,
        @Size(max = 2000) String body,
        @Size(max = 500) String href,
        Integer sortOrder
) {
}
