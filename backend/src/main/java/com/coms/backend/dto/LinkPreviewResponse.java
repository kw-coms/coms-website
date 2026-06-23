package com.coms.backend.dto;

/**
 * OpenGraph-style preview metadata for a generic external link. {@code image} may be
 * null/blank when the target page exposes no usable (absolute https) preview image, in
 * which case the frontend renders a card with just title/description/site.
 */
public record LinkPreviewResponse(
        String url,
        String title,
        String description,
        String image,
        String siteName
) {
}
