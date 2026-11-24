package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonEventStatus;
import java.time.LocalDateTime;

public record HackathonEventSummary(Long id, String title, Integer year, Integer semester, boolean open,
                                    boolean allowGuestReviews,
                                    String theme, LocalDateTime startsAt, LocalDateTime endsAt,
                                    HackathonEventStatus status, boolean resultsPublished, int projectCount) {
    public static HackathonEventSummary from(HackathonEvent event, HackathonEventStatus status, int projectCount) {
        return new HackathonEventSummary(event.getId(), event.getTitle(), event.getYear(), event.getSemester(),
                event.isOpen(), event.isAllowGuestReviews(), event.getTheme(), event.getStartsAt(), event.getEndsAt(), status,
                event.isResultsPublished() && status == HackathonEventStatus.DONE, projectCount);
    }
}
