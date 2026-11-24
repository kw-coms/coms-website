package com.coms.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ClubActivityTimelineResponse(
        Long id,
        String title,
        String kind,
        String category,
        String categoryName,
        String kindLabel,
        String description,
        String resolvedStatus,
        @Schema(types = {"string", "null"}, format = "date") LocalDate eventDate,
        @Schema(types = {"string", "null"}, format = "date") LocalDate endDate,
        String startTime,
        String endTime,
        String dateLabel,
        String timelineTerm,
        String memberFacts
) {}
