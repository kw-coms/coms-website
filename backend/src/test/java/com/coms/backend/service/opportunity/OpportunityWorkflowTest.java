package com.coms.backend.service.opportunity;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.OpportunityDto.*;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:opportunity-workflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OpportunityWorkflowTest {
    @Autowired OpportunityStore store;
    @Autowired JdbcClient jdbc;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired MockMvc mvc;

    @BeforeEach
    void reset() {
        jdbc.sql("DELETE FROM external_opportunities").update();
        jdbc.sql("""
                UPDATE external_opportunity_collection SET lease_token = NULL, lease_until = NULL, next_at = NULL,
                    last_run_at = NULL, source_report_json = NULL, ai_usage_day = NULL, ai_attempts = 0
                """).update();
    }

    @Test
    void changedOfficialNoticeReturnsToReviewWhileApprovedVersionStaysPublic() throws Exception {
        var first = prepare("예제 공개 코딩 대회", "2027-03-07T19:00");
        assertThat(store.saveCollected(first, first.content())).isTrue();
        assertThat(store.unchanged(first)).isTrue();
        assertThat(store.saveCollected(first, first.content())).isFalse();
        var draft = store.candidates(Status.PENDING, 0).items().getFirst();
        assertThat(draft.published()).isFalse();
        mvc.perform(get("/api/opportunities")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());

        var chair = account("opportunity-chair", Member.Role.ADMIN);
        mvc.perform(put("/api/admin/opportunities/" + draft.id()).cookie(chair)
                        .header("Origin", "https://coms.kw.ac.kr").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"version":0,"action":"PUBLISH","category":"CONTEST","title":"검토한 예제 대회",
                                 "eventStart":"2027-03-07T19:00"}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.published").value(true));
        mvc.perform(get("/api/opportunities")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("검토한 예제 대회"))
                .andExpect(jsonPath("$[0].eventStart").value("2027-03-07T19:00"))
                .andExpect(jsonPath("$[0].version").doesNotExist())
                .andExpect(jsonPath("$[0].aiAssisted").doesNotExist());

        var changed = prepare("예제 대회 일정 변경", "2027-03-08");
        assertThat(store.saveCollected(changed, changed.content())).isTrue();
        assertThat(store.candidates(Status.PENDING, 0).items()).singleElement().satisfies(item -> {
            assertThat(item.published()).isTrue();
            assertThat(item.eventStart()).isEqualTo("2027-03-08");
        });
        assertThat(store.published().getFirst().eventStart()).isEqualTo("2027-03-07T19:00");
        assertThatThrownBy(() -> store.review(draft.id(), new Review(0L, Action.IGNORE, null, null, null, null, null, null)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        var ignored = store.review(draft.id(), new Review(2L, Action.IGNORE, null, null, null, null, null, null));
        assertThat(ignored.published()).isTrue();
        store.review(draft.id(), new Review(3L, Action.UNPUBLISH, null, null, null, null, null, null));
        assertThat(store.published()).isEmpty();
    }

    @Test
    void administrationCannotBeReadByGuestsOrOrdinaryMembers() throws Exception {
        mvc.perform(get("/api/admin/opportunities")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/opportunities").cookie(account("opportunity-member", Member.Role.USER)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/opportunities/collect").cookie(account("opportunity-chair", Member.Role.ADMIN))
                        .header("Origin", "https://coms.kw.ac.kr"))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void collectorLeaseAndDailyAiBudgetAreEnforcedInTheDatabase() {
        assertThat(store.acquire("attempt-one")).isTrue();
        assertThat(store.acquire("attempt-two")).isFalse();
        assertThat(store.claimAiAttempt("attempt-two", 2)).isFalse();
        assertThat(store.claimAiAttempt("attempt-one", 2)).isTrue();
        assertThat(store.claimAiAttempt("attempt-one", 2)).isTrue();
        assertThat(store.claimAiAttempt("attempt-one", 2)).isFalse();
        store.finish("attempt-one", List.of(new SourceReport("test", "예제 공식 출처", SourceResult.SUCCESS, 1, 1)));
        var status = store.collectionStatus(true);
        assertThat(status.running()).isFalse();
        assertThat(status.sources()).hasSize(1);
        assertThat(store.acquire("attempt-two")).isFalse();
    }

    @Test
    void rejectContactAndIdentifiersInPublishedTitles() {
        var privateData = new OpportunityNotice("test", "p1", "예제 공식 출처", "https://example.com/events/p1",
                "HACKATHON", "담당자: 예제", null, null, null, null, "ignored");
        assertThat(store.prepare(privateData, "")).isEmpty();
    }

    private OpportunityStore.Prepared prepare(String title, String start) {
        var item = new OpportunityNotice("test", "c1", "예제 공식 출처", "https://example.com/events/c1",
                "CONTEST", title, null, null, start, null, null);
        return store.prepare(item, "").orElseThrow();
    }

    private Cookie account(String id, Member.Role role) {
        var member = members.findByStudentId(id).orElseGet(() -> {
            var fixture = new Member();
            fixture.setStudentId(id);
            fixture.setName("검증 계정");
            fixture.setGeneration("1");
            fixture.setEmail(id + "@example.com");
            fixture.setPassword("fixture-password-hash");
            fixture.setRole(role);
            fixture.setEmailVerified(true);
            return members.save(fixture);
        });
        return new Cookie("token", tokens.generateToken(member.getStudentId(), member.getTokenVersion()));
    }
}
