package com.coms.backend.dto;

public record ClubActivityCategoryResponse(
        Long id,
        String key,
        String name,
        int position,
        long activityCount
) {
}
