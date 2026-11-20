package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonEventStatus;
import java.time.LocalDateTime;

public record AdminHackathonEventSummary(Long id, String title, Integer year, Integer semester,
                                         boolean open, boolean published, LocalDateTime startsAt,
                                         LocalDateTime endsAt, HackathonEventStatus status, boolean resultsPublished) {
    public static AdminHackathonEventSummary from(HackathonEvent event, HackathonEventStatus status) {
        return new AdminHackathonEventSummary(event.getId(), event.getTitle(), event.getYear(), event.getSemester(),
                event.isOpen(), event.isPublished(), event.getStartsAt(), event.getEndsAt(), status, event.isResultsPublished());
    }
}
