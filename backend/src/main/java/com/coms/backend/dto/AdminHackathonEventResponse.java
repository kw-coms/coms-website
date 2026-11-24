package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonEventStatus;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import java.time.LocalDateTime;
import java.util.List;

public record AdminHackathonEventResponse(Long id, String title, Integer year, Integer semester, boolean open,
                                          boolean allowGuestReviews,
                                          String theme, String introduction, String rules,
                                          List<HackathonProjectResponse> projects,
                                          List<HackathonMaterialResponse> materials, boolean published,
                                          LocalDateTime startsAt, LocalDateTime endsAt, HackathonEventStatus status,
                                          boolean resultsPublished) {
    public static AdminHackathonEventResponse from(HackathonEvent event, List<HackathonProject> projects,
                                                   List<HackathonMaterial> materials, HackathonEventStatus status) {
        HackathonEventResponse publicEvent = HackathonEventResponse.from(event, projects, materials, status, List.of());
        return new AdminHackathonEventResponse(publicEvent.id(), publicEvent.title(), publicEvent.year(),
                publicEvent.semester(), publicEvent.open(), publicEvent.allowGuestReviews(), publicEvent.theme(), publicEvent.introduction(),
                publicEvent.rules(), publicEvent.projects(), publicEvent.materials(), event.isPublished(),
                event.getStartsAt(), event.getEndsAt(), status, event.isResultsPublished());
    }
}
