package com.coms.backend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ClubFormDto {
    private ClubFormDto() {}

    public enum Category { HACKATHON, TEAM_PROJECT, OTHER }
    public enum Kind { SHORT, LONG, SINGLE, MULTIPLE }

    @Schema(name = "ClubFormQuestion")
    public record Question(String id, String label, Kind kind, boolean required, List<String> options) {}

    @Schema(name = "ClubFormWrite")
    public record Write(String title, String description, Category category, Long hackathonEventId,
                        List<Question> questions, boolean accepting, LocalDateTime closesAt, Long version) {}

    @Schema(name = "ClubForm")
    public record Form(Long id, String title, String description, Category category, Long hackathonEventId,
                       List<Question> questions, boolean accepting, boolean open, LocalDateTime closesAt, long version) {}

    @Schema(name = "ClubFormSummary")
    public record Summary(Long id, String title, String description, Category category, Long hackathonEventId,
                          boolean open, LocalDateTime closesAt, boolean submitted) {}

    @Schema(name = "ClubFormSubmission")
    public record Submission(Long formVersion, Map<String, List<String>> answers) {}
    @Schema(name = "ClubFormOwnResponse")
    public record OwnResponse(Map<String, List<String>> answers, Instant submittedAt) {}
    @Schema(name = "ClubFormView")
    public record View(Form form, OwnResponse response) {}
    @Schema(name = "ClubFormResponseRow")
    public record ResponseRow(String name, String studentId, Map<String, List<String>> answers, Instant submittedAt) {}
    @Schema(name = "ClubFormResponses")
    public record Responses(List<ResponseRow> items, int page, long total) {}
}
