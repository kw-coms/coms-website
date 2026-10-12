package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Who attended how often, for members who may run attendance: the recent checks, newest
 * first, and one row per member who checked in to at least one of them. Names only; no
 * student id is sent.
 */
public record AttendanceSummaryResponse(
        List<SummarySession> sessions,
        List<SummaryMember> members
) {
    public record SummarySession(Long id, String title, LocalDateTime openedAt, int attendeeCount) {
    }

    /** {@code sessionIds} are the checks this member attended. */
    public record SummaryMember(String name, int count, List<Long> sessionIds) {
    }
}
