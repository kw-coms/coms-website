package com.coms.backend.dto;

import java.time.LocalDateTime;

/**
 * A gathering as the list shows it. {@code mine}, {@code canManage} and {@code joined} are
 * about the member asking. {@code full} is true when a limit is set and reached.
 */
public record GatheringResponse(
        Long id,
        String title,
        String description,
        String creatorName,
        boolean mine,
        boolean canManage,
        Integer capacity,
        String noteLabel,
        LocalDateTime closesAt,
        boolean open,
        boolean full,
        int participantCount,
        boolean joined,
        LocalDateTime createdAt
) {
}
