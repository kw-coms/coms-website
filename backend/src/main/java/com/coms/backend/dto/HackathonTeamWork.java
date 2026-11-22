package com.coms.backend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

public record HackathonTeamWork(boolean editable, List<HackathonProjectResponse> projects) {
    @Schema(name = "HackathonTeamWorkWrite")
    public record Write(String title, String author, String description, String github, String live, Long version) {}
}
