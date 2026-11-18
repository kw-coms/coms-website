package com.coms.backend.dto;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import java.util.List;

public record AdminHackathonEventResponse(Long id, String title, Integer year, Integer semester, boolean open,
                                          String theme, String introduction, String rules,
                                          List<HackathonProjectResponse> projects,
                                          List<HackathonMaterialResponse> materials, boolean published) {
    public static AdminHackathonEventResponse from(HackathonEvent event, List<HackathonProject> projects,
                                                   List<HackathonMaterial> materials) {
        HackathonEventResponse publicEvent = HackathonEventResponse.from(event, projects, materials);
        return new AdminHackathonEventResponse(publicEvent.id(), publicEvent.title(), publicEvent.year(),
                publicEvent.semester(), publicEvent.open(), publicEvent.theme(), publicEvent.introduction(),
                publicEvent.rules(), publicEvent.projects(), publicEvent.materials(), event.isPublished());
    }
}
