package com.coms.backend.service;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class ClubActivityTimelineStatusTest {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Test
    void automaticStatusCoversUndatedBeforeStartWholeDayAndAfterEnd() {
        LocalDate day = LocalDate.of(2026, 11, 15);
        assertThat(resolve(null, null, null, null, "2026-11-15T00:00:00+09:00")).isEqualTo("PLANNED");
        assertThat(resolve(day, null, null, null, "2026-11-14T23:59:59+09:00")).isEqualTo("CONFIRMED");
        assertThat(resolve(day, null, null, null, "2026-11-15T00:00:00+09:00")).isEqualTo("LIVE");
        assertThat(resolve(day, null, null, null, "2026-11-15T23:59:59+09:00")).isEqualTo("LIVE");
        assertThat(resolve(day, null, null, null, "2026-11-16T00:00:00+09:00")).isEqualTo("DONE");
    }

    @Test
    void timeBoundariesAndManualOverrideAreInclusive() {
        LocalDate start = LocalDate.of(2026, 11, 8);
        LocalDate end = LocalDate.of(2026, 11, 15);
        LocalTime startTime = LocalTime.of(18, 0);
        LocalTime endTime = LocalTime.of(4, 0);
        assertThat(resolve(start, end, startTime, endTime, "2026-11-08T17:59:59+09:00")).isEqualTo("CONFIRMED");
        assertThat(resolve(start, end, startTime, endTime, "2026-11-15T04:00:00+09:00")).isEqualTo("LIVE");
        assertThat(resolve(start, end, startTime, endTime, "2026-11-15T04:00:01+09:00")).isEqualTo("DONE");
        assertThat(ClubActivityTimelineStatus.resolve("PLANNED", start, end, startTime, endTime,
                LocalDateTime.of(2026, 11, 16, 0, 0))).isEqualTo("PLANNED");
    }

    @Test
    void januaryAndFebruaryBelongToPreviousWinterTerm() {
        assertThat(ClubActivityTimelineStatus.term(LocalDate.of(2027, 1, 1))).isEqualTo("2026 겨울방학");
        assertThat(ClubActivityTimelineStatus.term(LocalDate.of(2026, 3, 1))).isEqualTo("2026 1학기");
        assertThat(ClubActivityTimelineStatus.term(LocalDate.of(2026, 7, 1))).isEqualTo("2026 여름방학");
        assertThat(ClubActivityTimelineStatus.term(LocalDate.of(2026, 9, 1))).isEqualTo("2026 2학기");
    }

    private String resolve(LocalDate start, LocalDate end, LocalTime startTime, LocalTime endTime, String instant) {
        return ClubActivityTimelineStatus.resolve(null, start, end, startTime, endTime,
                LocalDateTime.ofInstant(Instant.from(java.time.OffsetDateTime.parse(instant)), KST));
    }
}
