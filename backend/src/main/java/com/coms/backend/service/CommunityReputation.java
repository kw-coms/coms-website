package com.coms.backend.service;

import com.coms.backend.dto.CommunityReputationResponse;

/**
 * Pure, derived reputation computation for a community member. The score is a weighted sum of
 * existing activity signals (posts authored, comments authored, net upvotes received on the member's
 * posts) and maps onto a small tier ladder. Nothing here is persisted: the inputs are aggregated on
 * read from existing tables, so this stays a derived stat rather than a denormalized score column.
 */
final class CommunityReputation {
    private static final long WEIGHT_POST = 3;
    private static final long WEIGHT_COMMENT = 1;
    private static final long WEIGHT_UPVOTE = 2;

    private CommunityReputation() {}

    enum Tier {
        NEWCOMER("신입", 0),
        ACTIVE("활동", 10),
        EXCELLENT("우수", 50),
        VETERAN("베테랑", 150);

        private final String label;
        private final long minScore;

        Tier(String label, long minScore) {
            this.label = label;
            this.minScore = minScore;
        }

        String label() {
            return label;
        }

        static Tier forScore(long score) {
            Tier resolved = NEWCOMER;
            for (Tier tier : values()) {
                if (score >= tier.minScore) {
                    resolved = tier;
                }
            }
            return resolved;
        }
    }

    /**
     * @param postCount     number of posts authored by the member
     * @param commentCount  number of comments authored by the member
     * @param upvotesReceived net upvote value (upvotes minus downvotes) across the member's posts;
     *                        negative contributions are floored at zero so downvote brigades cannot
     *                        push the displayed score below the activity it already earned.
     */
    static CommunityReputationResponse compute(long postCount, long commentCount, long upvotesReceived) {
        long safePosts = Math.max(0, postCount);
        long safeComments = Math.max(0, commentCount);
        long safeUpvotes = Math.max(0, upvotesReceived);
        long score = safePosts * WEIGHT_POST
                + safeComments * WEIGHT_COMMENT
                + safeUpvotes * WEIGHT_UPVOTE;
        Tier tier = Tier.forScore(score);
        return new CommunityReputationResponse(
                score,
                tier.name(),
                tier.label(),
                new CommunityReputationResponse.Breakdown(safePosts, safeComments, safeUpvotes)
        );
    }
}
