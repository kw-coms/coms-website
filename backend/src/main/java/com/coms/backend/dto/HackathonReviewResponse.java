package com.coms.backend.dto;

import com.coms.backend.domain.HackathonReview;

import java.time.LocalDateTime;

public record HackathonReviewResponse(Long id, String projectId, Integer generation, String name,
                                      Integer themeFit, Integer creativity, Integer technology,
                                      Integer completeness, Integer practicality, String feedback,
                                      boolean chair, LocalDateTime createdAt) {
    public static HackathonReviewResponse from(HackathonReview row) {
        return new HackathonReviewResponse(row.getId(), row.getProjectId(), row.isChair() ? null : row.getGeneration(),
                row.getName(), row.getThemeFit(), row.getCreativity(), row.getTechnology(),
                row.getCompleteness(), row.getPracticality(), row.getFeedback(), row.isChair(), row.getCreatedAt());
    }
}
