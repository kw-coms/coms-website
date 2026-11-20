package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HackathonRankingTest {
    @Test
    void roundingMatchesTheBrowsersToFixedNotMathRound() {
        // 498.705는 이진 표현이 498.70499999…라 toFixed(2)는 498.70이지만, Math.round(v * 100)은 498.71이 된다.
        double value = 498.705;
        assertThat(Math.round(value * 100) / 100.0).isEqualTo(498.71);
        assertThat(HackathonRanking.round(value)).isEqualTo(498.7);
        assertThat(HackathonRanking.round(85.0)).isEqualTo(85.0);
        assertThat(HackathonRanking.round(17.125)).isEqualTo(17.13);
    }
}
