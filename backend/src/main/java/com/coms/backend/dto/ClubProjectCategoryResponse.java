package com.coms.backend.dto;

public record ClubProjectCategoryResponse(
        Long id,
        String key,
        String name,
        int position,
        long projectCount
) {
}
