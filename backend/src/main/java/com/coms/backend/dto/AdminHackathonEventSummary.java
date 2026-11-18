package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;

public record AdminHackathonEventSummary(Long id, String title, Integer year, Integer semester,
                                         boolean open, boolean published) {
    public static AdminHackathonEventSummary from(HackathonEvent event) {
        return new AdminHackathonEventSummary(event.getId(), event.getTitle(), event.getYear(), event.getSemester(), event.isOpen(), event.isPublished());
    }
}
