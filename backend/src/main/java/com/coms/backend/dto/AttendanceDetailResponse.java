package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

/** An attendance check with who checked in, for members who may run attendance. */
public record AttendanceDetailResponse(
        AttendanceSessionResponse session,
        List<Attendee> attendees
) {
    /** One check-in. Names only; no student id is sent. */
    public record Attendee(String name, LocalDateTime checkedAt) {
    }
}
