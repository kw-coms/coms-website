package com.coms.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

/** A gathering with who signed up, in the order they did. */
public record GatheringDetailResponse(
        GatheringResponse gathering,
        List<GatheringParticipant> participants
) {
    /**
     * One name on the gathering. Names only; no student id is sent. {@code note} is sent to
     * whoever may manage the gathering and to the member who wrote it, and is null for
     * everyone else.
     */
    public record GatheringParticipant(Long id, String name, boolean mine, String note, LocalDateTime signedUpAt) {
    }
}
