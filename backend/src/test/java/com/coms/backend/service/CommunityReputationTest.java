package com.coms.backend.service;

import com.coms.backend.dto.CommunityReputationResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CommunityReputationTest {

    @Test
    void scoreIsWeightedSumOfActivity() {
        // 2 posts * 3 + 4 comments * 1 + 5 upvotes * 2 = 6 + 4 + 10 = 20
        CommunityReputationResponse result = CommunityReputation.compute(2, 4, 5);

        assertThat(result.score()).isEqualTo(20);
        assertThat(result.breakdown().posts()).isEqualTo(2);
        assertThat(result.breakdown().comments()).isEqualTo(4);
        assertThat(result.breakdown().upvotes()).isEqualTo(5);
    }

    @Test
    void newMemberWithNoActivityIsNewcomerTier() {
        CommunityReputationResponse result = CommunityReputation.compute(0, 0, 0);

        assertThat(result.score()).isZero();
        assertThat(result.tier()).isEqualTo("NEWCOMER");
        assertThat(result.tierLabel()).isEqualTo("신입");
    }

    @Test
    void mapsScoreThresholdsToTiers() {
        // 신입 0-9
        assertThat(CommunityReputation.compute(3, 0, 0).tierLabel()).isEqualTo("신입"); // score 9
        // 활동 10-49
        assertThat(CommunityReputation.compute(0, 10, 0).tierLabel()).isEqualTo("활동"); // score 10
        assertThat(CommunityReputation.compute(0, 49, 0).tierLabel()).isEqualTo("활동"); // score 49
        // 우수 50-149
        assertThat(CommunityReputation.compute(0, 50, 0).tierLabel()).isEqualTo("우수"); // score 50
        assertThat(CommunityReputation.compute(0, 149, 0).tierLabel()).isEqualTo("우수"); // score 149
        // 베테랑 150+
        assertThat(CommunityReputation.compute(0, 150, 0).tierLabel()).isEqualTo("베테랑"); // score 150
        assertThat(CommunityReputation.compute(50, 0, 0).tier()).isEqualTo("VETERAN"); // score 150
    }

    @Test
    void negativeUpvotesAreFlooredAtZeroAndDoNotReducePostedActivity() {
        CommunityReputationResponse result = CommunityReputation.compute(2, 0, -10);

        assertThat(result.breakdown().upvotes()).isZero();
        assertThat(result.score()).isEqualTo(6); // 2 posts * 3, upvotes floored
    }
}
