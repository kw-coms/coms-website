package com.coms.backend.dto;

import java.time.LocalDateTime;

/**
 * An attendance check as the list shows it. {@code attended} is about the member asking.
 * {@code remainingSeconds} is how long check-in stays open, counted on the server so the
 * countdown does not depend on the viewer's clock or time zone; 0 once it is over.
 * {@code code} is sent only to members who may run attendance, and only while it is open.
 */
public record AttendanceSessionResponse(
        Long id,
        String title,
        String openedByName,
        LocalDateTime openedAt,
        LocalDateTime closesAt,
        boolean open,
        long remainingSeconds,
        int attendeeCount,
        boolean attended,
        String code
) {
}
