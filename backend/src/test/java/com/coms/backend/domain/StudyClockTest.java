package com.coms.backend.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class StudyClockTest {
    @Test
    void studyTimestampsUseSeoulTimeOnAUtcHost() {
        var previous = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        try {
            var seoul = ZoneId.of("Asia/Seoul");
            var before = LocalDateTime.now(seoul);
            var group = new StudyGroup();
            var membership = new StudyGroupMember();
            var interest = new StudyInterest();
            var session = new StudySession();
            group.touch();
            var after = LocalDateTime.now(seoul);

            assertThat(group.getCreatedAt()).isBetween(before, after);
            assertThat(group.getUpdatedAt()).isBetween(before, after);
            assertThat(membership.getJoinedAt()).isBetween(before, after);
            assertThat(interest.getCreatedAt()).isBetween(before, after);
            assertThat(session.getCreatedAt()).isBetween(before, after);
        } finally {
            TimeZone.setDefault(previous);
        }
    }
}
