package com.coms.backend.dto;

public record AppCatalogResponse(
        Long id,
        String title,
        String eyebrow,
        String body,
        String href,
        int sortOrder
) {
}
