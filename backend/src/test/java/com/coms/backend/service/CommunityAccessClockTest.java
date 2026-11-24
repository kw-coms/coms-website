package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class CommunityAccessClockTest {
    @Test
    void graduateRuleChangesAtSeoulNewYear() {
        Member member = new Member();
        member.setStudentId("2020123456");
        var members = mock(MemberRepository.class);
        var permissions = mock(PermissionService.class);
        ZoneId seoul = ZoneId.of("Asia/Seoul");

        var before = new CommunityAccess(members, permissions,
                Clock.fixed(Instant.parse("2026-12-31T14:59:00Z"), seoul));
        var after = new CommunityAccess(members, permissions,
                Clock.fixed(Instant.parse("2026-12-31T15:01:00Z"), seoul));

        assertThat(before.isGraduate(member)).isFalse();
        assertThat(after.isGraduate(member)).isTrue();
    }
}
