package com.coms.backend.dto;

public record ClubProjectEngagementResponse(
        long viewCount,
        long likeCount,
        long commentCount,
        boolean likedByMe
) {}
