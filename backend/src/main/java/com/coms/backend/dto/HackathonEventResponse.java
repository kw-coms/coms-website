package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonEventStatus;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import java.time.LocalDateTime;
import java.util.List;

public record HackathonEventResponse(Long id, String title, Integer year, Integer semester, boolean open,
                                     boolean allowGuestReviews,
                                     String theme, String introduction, String rules,
                                     List<HackathonProjectResponse> projects,
                                     List<HackathonMaterialResponse> materials,
                                     LocalDateTime startsAt, LocalDateTime endsAt, HackathonEventStatus status,
                                     boolean resultsPublished, List<HackathonResultResponse> results) {
    public static HackathonEventResponse from(HackathonEvent event, List<HackathonProject> projects,
                                              List<HackathonMaterial> materials, HackathonEventStatus status,
                                              List<HackathonResultResponse> results) {
        return new HackathonEventResponse(event.getId(), event.getTitle(), event.getYear(), event.getSemester(),
                event.isOpen(), event.isAllowGuestReviews(), event.getTheme(), event.getIntroduction(), event.getRules(),
                projects.stream().map(project -> HackathonProjectResponse.from(project, materials)).toList(),
                materials.stream().filter(material -> material.getProjectId() == null)
                        .map(HackathonMaterialResponse::from).toList(),
                event.getStartsAt(), event.getEndsAt(), status, event.isResultsPublished() && status == HackathonEventStatus.DONE, results);
    }
}
