package com.coms.backend.dto;

import java.time.LocalDateTime;

/** The result of a check-in. {@code alreadyChecked} is true when the member had checked in before. */
public record AttendanceCheckInResponse(
        Long sessionId,
        String title,
        LocalDateTime checkedAt,
        boolean alreadyChecked
) {
}
