package com.coms.backend.dto;

public record CommunityReputationResponse(
        long score,
        String tier,
        String tierLabel,
        /** 서버가 보관 중인 기수. 회원 정보에 기수가 없으면 null. */
        String generation,
        Breakdown breakdown
) {
    public record Breakdown(long posts, long comments, long upvotes) {}
}
