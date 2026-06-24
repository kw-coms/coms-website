package com.coms.backend.dto;

public record CommunityReputationResponse(
        long score,
        String tier,
        String tierLabel,
        Breakdown breakdown
) {
    public record Breakdown(long posts, long comments, long upvotes) {}
}
