package com.coms.backend.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class ClubProjectClockTest {
    @Test
    void creationAndJpaUpdateUseSeoulTimeOnAUtcHost() {
        var previous = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        try {
            var seoul = ZoneId.of("Asia/Seoul");
            var before = LocalDateTime.now(seoul);
            var project = new ClubProject();
            project.touch();
            var after = LocalDateTime.now(seoul);

            assertThat(project.getCreatedAt()).isBetween(before, after);
            assertThat(project.getUpdatedAt()).isBetween(before, after);
        } finally {
            TimeZone.setDefault(previous);
        }
    }
}
