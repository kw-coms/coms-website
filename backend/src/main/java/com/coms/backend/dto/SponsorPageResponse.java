package com.coms.backend.dto;

/**
 * {@code GET /api/sponsors/page} — the design settings plus the counts the page may show.
 * {@code sponsorCount} counts only publicly visible sponsors, so a hidden or expired row
 * never inflates the "총 후원자 수" badge.
 */
public record SponsorPageResponse(
        SponsorPageSettings settings,
        String bannerImageUrl,
        int sponsorCount,
        int tierCount
) {
}
