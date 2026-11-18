package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;

public record HackathonEventSummary(Long id, String title, Integer year, Integer semester, boolean open) {
    public static HackathonEventSummary from(HackathonEvent event) {
        return new HackathonEventSummary(event.getId(), event.getTitle(), event.getYear(), event.getSemester(), event.isOpen());
    }
}
