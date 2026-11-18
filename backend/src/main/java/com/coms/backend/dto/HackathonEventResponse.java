package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import java.util.List;

public record HackathonEventResponse(Long id, String title, Integer year, Integer semester, boolean open,
                                     String theme, String introduction, String rules,
                                     List<HackathonProjectResponse> projects,
                                     List<HackathonMaterialResponse> materials) {
    public static HackathonEventResponse from(HackathonEvent event, List<HackathonProject> projects,
                                              List<HackathonMaterial> materials) {
        return new HackathonEventResponse(event.getId(), event.getTitle(), event.getYear(), event.getSemester(),
                event.isOpen(), event.getTheme(), event.getIntroduction(), event.getRules(),
                projects.stream().map(project -> HackathonProjectResponse.from(project, materials)).toList(),
                materials.stream().filter(material -> material.getProjectId() == null)
                        .map(HackathonMaterialResponse::from).toList());
    }
}
