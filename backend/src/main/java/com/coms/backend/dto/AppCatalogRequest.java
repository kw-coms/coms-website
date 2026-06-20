package com.coms.backend.dto;

public record AppCatalogRequest(
        String title,
        String eyebrow,
        String body,
        String href,
        Integer sortOrder
) {
}
