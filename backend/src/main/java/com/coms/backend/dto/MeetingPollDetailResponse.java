package com.coms.backend.dto;

import java.util.List;

/** A meeting poll with everyone's answers, for the page that shows the shared grid. */
public record MeetingPollDetailResponse(
        MeetingPollSummaryResponse poll,
        List<Participant> participants
) {
    /** One member's answer. {@code mine} marks the asking member's own row; no student id is sent. */
    public record Participant(String name, boolean mine, String slots) {
    }
}
