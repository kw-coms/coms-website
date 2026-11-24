package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class TimeConfigTest {
    @Test
    void clockUsesSeoulEvenWhenHostZoneDoesNot() {
        var clock = new TimeConfig().clock();
        assertThat(clock.getZone()).isEqualTo(ZoneId.of("Asia/Seoul"));
        assertThat(LocalDate.ofInstant(Instant.parse("2026-11-30T15:30:00Z"), clock.getZone()))
                .isEqualTo(LocalDate.of(2026, 12, 1));
    }
}
