package com.coms.backend.dto;

import com.coms.backend.domain.HackathonReview;
import java.time.LocalDateTime;

public record HackathonEventReviewResponse(Long id, Long eventId, String projectId, Integer generation,
                                           String name, Integer themeFit, Integer creativity, Integer technology,
                                           Integer completeness, Integer practicality, String feedback,
                                           boolean chair, LocalDateTime createdAt) {
    public static HackathonEventReviewResponse from(HackathonReview review) {
        HackathonReviewResponse old = HackathonReviewResponse.from(review);
        return new HackathonEventReviewResponse(old.id(), review.getEventId(), old.projectId(), old.generation(),
                old.name(), old.themeFit(), old.creativity(), old.technology(), old.completeness(),
                old.practicality(), old.feedback(), old.chair(), old.createdAt());
    }
}
