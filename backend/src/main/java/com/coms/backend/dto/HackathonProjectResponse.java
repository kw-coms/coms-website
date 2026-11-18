package com.coms.backend.dto;

import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.HackathonProject;
import java.util.List;

public record HackathonProjectResponse(String projectId, String title, String author, String description,
                                       String github, String live, Integer position,
                                       List<HackathonMaterialResponse> materials) {
    public static HackathonProjectResponse from(HackathonProject project, List<HackathonMaterial> materials) {
        return new HackathonProjectResponse(project.getId(), project.getTitle(), project.getAuthor(),
                project.getDescription(), project.getGithub(), project.getLive(), project.getPosition(),
                materials.stream().filter(material -> project.getId().equals(material.getProjectId()))
                        .map(HackathonMaterialResponse::from).toList());
    }
}
