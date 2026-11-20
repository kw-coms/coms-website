package com.coms.backend.controller;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonReview;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.repository.HackathonReviewRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:hackathon-archive-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class HackathonArchiveIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String NOT_DONE = "완료된 행사만 결과를 공개할 수 있습니다. 평가를 닫고 개발 기간이 끝난 뒤에 공개해 주세요.";

    @Autowired MockMvc mvc;
    @Autowired HackathonEventRepository events;
    @Autowired HackathonReviewRepository reviews;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired DataSource dataSource;
    private final ObjectMapper json = new ObjectMapper();
    private Cookie admin;

    @BeforeEach
    void reset() {
        reviews.deleteAll();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM hackathon_materials");
        jdbc.update("DELETE FROM hackathon_projects");
        jdbc.update("DELETE FROM hackathon_events");
        members.deleteAll();
        Member member = new Member();
        member.setStudentId("archive-chair");
        member.setName("chair");
        member.setEmail("archive-chair@example.com");
        member.setPassword("unused");
        member.setRole(Member.Role.ADMIN);
        member.setEmailVerified(true);
        members.saveAndFlush(member);
        admin = new Cookie("token", tokens.generateToken("archive-chair", member.getTokenVersion()));
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Seoul")).withNano(0); }

    private long event(int year, int semester, boolean published, boolean open, LocalDateTime start, LocalDateTime end) {
        HackathonEvent event = new HackathonEvent();
        event.setTitle(year + "년 " + semester + "학기");
        event.setYear(year);
        event.setSemester(semester);
        event.setTheme("주제 " + year);
        event.setPublished(published);
        event.setOpen(open);
        event.setStartsAt(start);
        event.setEndsAt(end);
        return events.saveAndFlush(event).getId();
    }

    private void project(long eventId, String id, String title) {
        new JdbcTemplate(dataSource).update(
                "INSERT INTO hackathon_projects (id,event_id,title,author,description,position) VALUES (?,?,?,'팀','설명',0)", id, eventId, title);
    }

    private void review(long eventId, String projectId, String name, boolean chair, int... s) {
        HackathonReview row = new HackathonReview();
        row.setEventId(eventId);
        row.setProjectId(projectId);
        row.setGeneration(chair ? 0 : 42);
        row.setName(name);
        row.setNameKey(chair ? "chair" : name.toLowerCase());
        row.setChair(chair);
        row.setThemeFit(s[0]);
        row.setCreativity(s[1]);
        row.setTechnology(s[2]);
        row.setCompleteness(s[3]);
        row.setPracticality(s[4]);
        row.setFeedback("비공개 의견");
        reviews.saveAndFlush(row);
    }

    private ResultActions setResults(long eventId, boolean value) throws Exception {
        return mvc.perform(put("/api/admin/hackathon/events/{id}/results-published", eventId).cookie(admin)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"resultsPublished\":" + value + "}"));
    }

    @Test
    void archiveListsOnlyPublishedEventsNewestFirstWithStatusAndPeriod() throws Exception {
        LocalDateTime now = now();
        long upcoming = event(2027, 1, true, false, now.plusDays(3), now.plusDays(10));
        long inProgress = event(2026, 2, true, false, now.minusDays(1), now.plusDays(2));
        long reviewing = event(2026, 1, true, true, now.minusDays(20), now.minusDays(10));
        long done = event(2025, 2, true, false, now.minusYears(1), now.minusYears(1).plusDays(7));
        long legacyOpen = event(2024, 2, true, true, null, null);
        event(2028, 1, false, false, null, null);
        project(done, "d1", "과거 작품");
        project(done, "d2", "과거 작품 2");
        mvc.perform(get("/api/hackathon/events")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].id").value(upcoming)).andExpect(jsonPath("$[0].status").value("UPCOMING"))
                .andExpect(jsonPath("$[1].id").value(inProgress)).andExpect(jsonPath("$[1].status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$[2].id").value(reviewing)).andExpect(jsonPath("$[2].status").value("REVIEWING"))
                .andExpect(jsonPath("$[3].id").value(done)).andExpect(jsonPath("$[3].status").value("DONE"))
                .andExpect(jsonPath("$[3].projectCount").value(2))
                .andExpect(jsonPath("$[3].theme").value("주제 2025"))
                .andExpect(jsonPath("$[3].startsAt").isString())
                .andExpect(jsonPath("$[4].id").value(legacyOpen)).andExpect(jsonPath("$[4].status").value("REVIEWING"))
                .andExpect(jsonPath("$[4].startsAt").doesNotExist());
        // 평가가 닫힌 완료 행사도 소개와 작품이 그대로 열린다.
        mvc.perform(get("/api/hackathon/events/{id}", done)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DONE")).andExpect(jsonPath("$.projects.length()").value(2));
    }

    @Test
    void resultsAreHiddenUntilPublishedAndOnlyForDoneEvents() throws Exception {
        LocalDateTime now = now();
        long done = event(2025, 2, true, false, now.minusDays(40), now.minusDays(33));
        project(done, "a", "A");
        review(done, "a", "Ann", false, 10, 10, 10, 10, 10);
        review(done, "a", "회장", true, 12, 12, 12, 12, 12);
        mvc.perform(get("/api/hackathon/events/{id}", done)).andExpect(status().isOk())
                .andExpect(jsonPath("$.resultsPublished").value(false)).andExpect(jsonPath("$.results.length()").value(0));
        setResults(done, true).andExpect(status().isOk()).andExpect(jsonPath("$.resultsPublished").value(true));
        String publicBody = mvc.perform(get("/api/hackathon/events/{id}", done)).andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].rank").value(1)).andReturn().getResponse().getContentAsString();
        assertThat(publicBody).doesNotContain("Ann").doesNotContain("비공개 의견").doesNotContain("feedback").doesNotContain("generation");
        // 평가가 다시 열리면 상태가 평가 중이므로 플래그가 켜져 있어도 점수는 숨는다.
        events.findById(done).ifPresent(e -> { e.setOpen(true); events.saveAndFlush(e); });
        mvc.perform(get("/api/hackathon/events/{id}", done))
                .andExpect(jsonPath("$.status").value("REVIEWING")).andExpect(jsonPath("$.resultsPublished").value(false))
                .andExpect(jsonPath("$.results.length()").value(0));
    }

    @Test
    void resultsPublishedIsRejectedUnlessDone() throws Exception {
        LocalDateTime now = now();
        for (long id : new long[]{
                event(2027, 1, true, false, now.plusDays(1), now.plusDays(5)),
                event(2027, 2, true, false, now.minusDays(1), now.plusDays(5)),
                event(2026, 1, true, true, now.minusDays(9), now.minusDays(2)),
                event(2026, 2, false, false, now.minusDays(9), now.minusDays(2))}) {
            setResults(id, true).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value(NOT_DONE));
        }
        long done = event(2025, 1, true, false, null, null);
        setResults(done, true).andExpect(status().isOk());
        setResults(done, false).andExpect(status().isOk());
        mvc.perform(put("/api/admin/hackathon/events/{id}/results-published", done).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void rankingFollowsTheAdminRuleAverageHalfChairHalfThenCompletenessThenThemeFit() throws Exception {
        long done = event(2025, 2, true, false, null, null);
        project(done, "a", "A");
        project(done, "b", "B");
        project(done, "c", "C");
        // A: 졸업생 80·90 평균 85, 회장 85 -> 최종 85, 완성도 17
        review(done, "a", "Ann", false, 16, 16, 16, 16, 16);
        review(done, "a", "Bob", false, 18, 18, 18, 18, 18);
        review(done, "a", "회장", true, 17, 17, 17, 17, 17);
        // B, C: 졸업생 95, 회장 75 -> 최종 85 동점, 완성도 15 -> A가 앞, B와 C는 공동 2위
        for (String id : new String[]{"b", "c"}) {
            review(done, id, "Ann", false, 20, 20, 20, 15, 20);
            review(done, id, "회장", true, 15, 15, 15, 15, 15);
        }
        setResults(done, true).andExpect(status().isOk());
        JsonNode results = json.readTree(mvc.perform(get("/api/hackathon/events/{id}", done)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get("results");
        assertThat(results).hasSize(3);
        assertThat(results.get(0).get("projectId").asText()).isEqualTo("a");
        assertThat(results.get(0).get("rank").asInt()).isEqualTo(1);
        assertThat(results.get(0).get("finalScore").asDouble()).isEqualTo(85.0);
        assertThat(results.get(0).get("alumniAverage").asDouble()).isEqualTo(85.0);
        assertThat(results.get(0).get("chairScore").asDouble()).isEqualTo(85.0);
        assertThat(results.get(0).get("alumniCount").asInt()).isEqualTo(2);
        assertThat(results.get(0).get("criteria").get("completeness").asDouble()).isEqualTo(17.0);
        assertThat(results.get(1).get("rank").asInt()).isEqualTo(2);
        assertThat(results.get(2).get("rank").asInt()).isEqualTo(2);
        assertThat(results.get(1).get("finalScore").asDouble()).isEqualTo(85.0);
        assertThat(results.get(1).get("criteria").get("themeFit").asDouble()).isEqualTo(17.5);
    }

    @Test
    void incompleteScoringPublishesNoRanking() throws Exception {
        long done = event(2025, 2, true, false, null, null);
        project(done, "a", "A");
        review(done, "a", "Ann", false, 10, 10, 10, 10, 10);
        setResults(done, true).andExpect(status().isOk());
        mvc.perform(get("/api/hackathon/events/{id}", done)).andExpect(jsonPath("$.results.length()").value(0));
    }

    @Test
    void adminCanRecordPastEventsWithPeriodAndPeriodIsValidated() throws Exception {
        String ok = "{\"title\":\"2023년 2학기\",\"year\":2023,\"semester\":2,\"startsAt\":\"2023-11-04T18:00\",\"endsAt\":\"2023-11-11T04:00\"}";
        mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(ok))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.startsAt").value("2023-11-04T18:00:00")).andExpect(jsonPath("$.resultsPublished").value(false));
        for (String bad : new String[]{
                "{\"title\":\"행사\",\"year\":2023,\"semester\":2,\"startsAt\":\"2023-11-04T18:00\"}",
                "{\"title\":\"행사\",\"year\":2023,\"semester\":2,\"startsAt\":\"2023-11-12T18:00\",\"endsAt\":\"2023-11-11T04:00\"}"}) {
            mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest());
        }
    }
}
