package com.coms.backend.dto;

import java.time.LocalDateTime;

/**
 * Whether the link of one entry of the app catalogue answered when the server last looked.
 * {@code linkUrl} is the address that was checked, so a page can tell when the entry has been
 * edited since. {@code state} is {@code UP}, {@code DOWN}, or {@code UNKNOWN} for an address
 * the server does not fetch.
 */
public record ClubProjectLinkStatusResponse(
        Long projectId,
        String linkUrl,
        String state,
        LocalDateTime checkedAt
) {
}
