package com.coms.backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * A meeting poll as the list shows it. {@code mine}, {@code canDelete} and {@code answered}
 * are about the member asking; no student id is sent.
 */
public record MeetingPollSummaryResponse(
        Long id,
        String title,
        String description,
        String creatorName,
        boolean mine,
        boolean canDelete,
        List<LocalDate> dates,
        int startMinute,
        int endMinute,
        int slotMinutes,
        LocalDateTime createdAt,
        int participantCount,
        boolean answered
) {
}
