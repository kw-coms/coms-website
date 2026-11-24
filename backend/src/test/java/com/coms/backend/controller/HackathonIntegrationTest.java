package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.HackathonSettings;
import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.repository.HackathonReviewRepository;
import com.coms.backend.repository.HackathonSettingsRepository;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.service.StorageService;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import javax.sql.DataSource;

import java.util.concurrent.CountDownLatch;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:hackathon-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class HackathonIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String SCORES = "\"themeFit\":18,\"creativity\":17,\"technology\":16,\"completeness\":15,\"practicality\":14,\"feedback\":\"좋은 작품\"";
    private static final AtomicInteger NEXT_IP = new AtomicInteger();
    private String testIp;

    @Autowired MockMvc mvc;
    @Autowired HackathonReviewRepository reviews;
    @Autowired HackathonSettingsRepository settings;
    @Autowired HackathonEventRepository events;
    @Autowired DataSource dataSource;
    @Autowired StorageService storage;
    private final ObjectMapper json = new ObjectMapper();
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void reset() {
        testIp = "192.0.2." + NEXT_IP.incrementAndGet();
        reviews.deleteAll();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        for (String stored : jdbc.queryForList("SELECT stored_name FROM hackathon_materials WHERE stored_name IS NOT NULL", String.class)) storage.delete(stored);
        jdbc.update("DELETE FROM hackathon_materials WHERE event_id <> 1 OR stored_name IS NOT NULL");
        jdbc.update("DELETE FROM hackathon_projects WHERE event_id <> 1");
        jdbc.update("DELETE FROM hackathon_events WHERE id <> 1");
        settings.deleteAll();
        settings.saveAndFlush(new HackathonSettings());
        jdbc.update("MERGE INTO hackathon_events (id,title,event_year,semester,theme,introduction,rules,published,open,allow_guest_reviews,starts_at,ends_at,results_published) KEY(id) VALUES (1,'COM’s 해커톤 2026',2026,2,'전쟁','','',TRUE,TRUE,TRUE,NULL,NULL,FALSE)");
        for (String projectId : new String[]{"wargether", "underground-route", "still"}) {
            jdbc.update("MERGE INTO hackathon_projects (id,event_id,title,author,description,position) KEY(id) VALUES (?,1,?,'기존 팀','기존 작품',0)", projectId, projectId);
        }
        jdbc.update("MERGE INTO hackathon_materials (id,event_id,project_id,kind,label,original_name,mime_type,file_size,legacy_url) KEY(id) VALUES (1,1,NULL,'presentation','개회식 안내','opening.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',402827,'/hackathon-2026/opening.pptx')");
        for (int i = 0; i < 3; i++) {
            String projectId = new String[]{"wargether", "underground-route", "still"}[i];
            jdbc.update("MERGE INTO hackathon_materials (id,event_id,project_id,kind,label,original_name,mime_type,file_size,legacy_url) KEY(id) VALUES (?,1,?,'proposal','계획서','proposal.pdf','application/pdf',123941,?)",
                    i + 2, projectId, "/hackathon-2026/" + projectId + "/proposal.pdf");
        }
        jdbc.execute("ALTER TABLE hackathon_events ALTER COLUMN id RESTART WITH 2");
        jdbc.execute("ALTER TABLE hackathon_materials ALTER COLUMN id RESTART WITH 5");
        members.deleteAll();
    }

    @Test
    void guestCanReviewEachTeamOnceAndNamesNormalizeAcrossUnicodeAndWhitespace() throws Exception {
        mvc.perform(get("/api/hackathon"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").value(true))
                .andExpect(jsonPath("$.reviews").doesNotExist());
        submit("wargether", 42, "Ａｎ ｎ").andExpect(status().isCreated())
                .andExpect(jsonPath("$.projectId").value("wargether"));
        submit("wargether", 42, "ann").andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이 기수와 이름으로 이 팀의 평가를 이미 제출했습니다."));
        submit("still", 42, "Ann").andExpect(status().isCreated());
        assertThat(reviews.count()).isEqualTo(2);
        assertThat(reviews.findAll().stream().allMatch(row -> !row.isChair())).isTrue();
    }

    @Test
    void guestReviewDefaultsOffAndAdminCanEnableItPerEvent() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("UPDATE hackathon_events SET allow_guest_reviews=FALSE WHERE id=1");
        submit("wargether", 42, "Alum").andExpect(status().isUnauthorized());
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/events/1/guest-reviews").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"allowGuestReviews\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.allowGuestReviews").value(true));
        mvc.perform(get("/api/hackathon/events/1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.allowGuestReviews").value(true));
        submit("wargether", 42, "Alum").andExpect(status().isCreated());
    }

    @Test
    void changingGuestNameCannotReviewTheSameProjectTwiceFromOneIp() throws Exception {
        submit("wargether", 42, "First Alum").andExpect(status().isCreated());
        submit("wargether", 43, "Another Alum").andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이 접속 주소에서 이 팀의 평가를 이미 제출했습니다."));
        submit("still", 43, "Another Alum").andExpect(status().isCreated());
    }

    @Test
    void guestIpDuplicateKeyUsesIpv6Slash64AndNormalizesMappedIpv4() throws Exception {
        String suffix = String.valueOf(NEXT_IP.incrementAndGet() % 60000);
        submitFrom("2001:db8:" + suffix + ":1::1", "wargether", 42, "First Alum").andExpect(status().isCreated());
        submitFrom("2001:db8:" + suffix + ":1:abcd::9", "wargether", 43, "Another Alum").andExpect(status().isConflict());
        submitFrom("2001:db8:" + suffix + ":2::1", "wargether", 44, "Third Alum").andExpect(status().isCreated());

        String v4 = "198.51.100." + (NEXT_IP.incrementAndGet() % 250);
        submitFrom("::ffff:" + v4, "still", 42, "Mapped Alum").andExpect(status().isCreated());
        submitFrom(v4, "still", 43, "Plain Alum").andExpect(status().isConflict());
    }

    private ResultActions submitFrom(String ip, String projectId, int generation, String name) throws Exception {
        return mvc.perform(post("/api/hackathon/reviews").header("Origin", ORIGIN)
                .with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType(MediaType.APPLICATION_JSON).content(body(projectId, generation, name)));
    }

    @Test
    void membersHaveSeparateProjectQuotaWhenGuestReviewsAreOff() throws Exception {
        new JdbcTemplate(dataSource).update("UPDATE hackathon_events SET allow_guest_reviews=FALSE WHERE id=1");
        Cookie first = account(Member.Role.USER, "first");
        Cookie second = account(Member.Role.USER, "second");
        mvc.perform(post("/api/hackathon/reviews").cookie(first).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body("wargether", 42, "First Alum")))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/hackathon/reviews").cookie(first).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body("wargether", 43, "Changed Name")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/hackathon/reviews").cookie(second).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body("wargether", 44, "Second Alum")))
                .andExpect(status().isCreated());
    }

    @Test
    void exhaustedGuestIpBudgetDoesNotBlockSignedInMembers() throws Exception {
        submit("wargether", 42, "Guest Alum").andExpect(status().isCreated());
        for (int attempt = 0; attempt < 9; attempt++) {
            submit("wargether", 42, "Guest Alum").andExpect(status().isConflict());
        }
        submit("wargether", 42, "Guest Alum").andExpect(status().isTooManyRequests());
        Cookie member = account(Member.Role.USER, "member");
        mvc.perform(post("/api/hackathon/reviews").cookie(member).header("Origin", ORIGIN)
                .with(request -> { request.setRemoteAddr(testIp); return request; })
                .contentType(MediaType.APPLICATION_JSON).content(body("wargether", 43, "Member Alum")))
                .andExpect(status().isCreated());
    }

    @Test
    void invalidOrMissingScoresAndIdentityAreRejected() throws Exception {
        submitBody("{\"projectId\":\"wargether\",\"generation\":2,\"name\":\"Ann\"," +
                SCORES.replace("\"themeFit\":18", "\"themeFit\":21") + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"unknown\",\"generation\":2,\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":0,\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":" + (java.time.Year.now(java.time.ZoneId.of("Asia/Seoul")).getValue() - 1966 + 1) + ",\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":2.9,\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":2,\"name\":\"Ann\"," +
                SCORES.replace("\"themeFit\":18", "\"themeFit\":18.9") + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":2,\"name\":\"Ann\"," +
                SCORES.replace("\"themeFit\":18,", "") + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":2,\"name\":\"Ann\"," +
                SCORES.replace("좋은 작품", "a".repeat(2001)) + "}")
                .andExpect(status().isBadRequest());
        assertThat(reviews.count()).isZero();
    }

    @Test
    void acceptsTheCurrentGenerationAsTheUpperBound() throws Exception {
        // 상한은 올해 기수(서울 기준 연도 - 1966)다. 2027년이면 61기도 받아야 한다.
        int current = java.time.Year.now(java.time.ZoneId.of("Asia/Seoul")).getValue() - 1966;
        submit("wargether", current, "Newest").andExpect(status().isCreated());
        assertThat(reviews.count()).isEqualTo(1);
    }

    @Test
    void adminOnlyCanInspectFeedbackAndEnterChairScores() throws Exception {
        submit("wargether", 3, "Alum").andExpect(status().isCreated());
        mvc.perform(get("/api/admin/hackathon/reviews")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/hackathon/reviews").cookie(account(Member.Role.USER, "member")))
                .andExpect(status().isForbidden());
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(get("/api/admin/hackathon/reviews").cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Alum"))
                .andExpect(jsonPath("$[0].feedback").value("좋은 작품"))
                .andExpect(jsonPath("$[0].chair").value(false))
                .andExpect(jsonPath("$[0].nameKey").doesNotExist());
        for (int i = 0; i < 2; i++) {
            mvc.perform(put("/api/admin/hackathon/chair-reviews/wargether").cookie(admin)
                            .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{" + SCORES + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.chair").value(true));
        }
        assertThat(reviews.count()).isEqualTo(2);
        assertThat(reviews.findByProjectIdAndGenerationAndNameKey("wargether", 0, "chair")).isPresent();
        mvc.perform(put("/api/admin/hackathon/chair-reviews/still").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + SCORES.replace("\"themeFit\":18", "\"themeFit\":18.9") + "}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/admin/hackathon/chair-reviews/still").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{" + SCORES + "}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanCloseAndReopenButGuestsCannotControlSettings() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/settings").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/hackathon/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").value(false));
        mvc.perform(get("/api/hackathon")).andExpect(jsonPath("$.open").value(false));
        submit("still", 2, "Alum").andExpect(status().isConflict());
        mvc.perform(put("/api/admin/hackathon/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":true}"))
                .andExpect(status().isOk());
        submit("still", 2, "Alum").andExpect(status().isCreated());
    }

    @Test
    void legacySettingsRowIsNotAnotherSourceOfEvaluationState() throws Exception {
        settings.deleteAll();
        mvc.perform(get("/api/hackathon")).andExpect(jsonPath("$.open").value(true));
        submit("still", 2, "Alum").andExpect(status().isCreated());
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isOk());
        submit("wargether", 2, "Alum").andExpect(status().isConflict());
    }

    @Test
    void anonymousSubmissionStillRequiresTrustedOriginAndCannotSpoofChair() throws Exception {
        mvc.perform(post("/api/hackathon/reviews").contentType(MediaType.APPLICATION_JSON)
                        .content(body("still", 2, "Alum")))
                .andExpect(status().isForbidden());
        submitBody(body("still", 2, "Alum").replace("{", "{\"chair\":true,"))
                .andExpect(status().isCreated());
        assertThat(reviews.findAll().getFirst().isChair()).isFalse();
    }

    @Test
    void closingAndSubmittingShareTheEventLock() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(1);
        try {
            var closing = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                HackathonEvent state = events.lockById(1L).orElseThrow();
                state.setOpen(false);
                locked.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("test lock not released");
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(ex);
                }
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            var submission = pool.submit(() -> {
                started.countDown();
                return mvc.perform(post("/api/hackathon/reviews").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(body("still", 2, "Alum"))).andReturn();
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThrows(TimeoutException.class, () -> submission.get(150, TimeUnit.MILLISECONDS));
            assertThat(reviews.count()).isZero();
            release.countDown();
            closing.get(5, TimeUnit.SECONDS);
            MvcResult result = submission.get(5, TimeUnit.SECONDS);
            assertThat(result.getResponse().getStatus()).isEqualTo(409);
            assertThat(reviews.count()).isZero();
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void onlyChairCanDeleteOneAlumniReviewAndItsIdentityCanSubmitAgain() throws Exception {
        submit("still", 3, "Alum").andExpect(status().isCreated());
        submit("wargether", 3, "Other").andExpect(status().isCreated());
        long id = reviews.findByProjectIdAndGenerationAndNameKey("still", 3, "alum").orElseThrow().getId();
        mvc.perform(delete("/api/admin/hackathon/reviews/{id}", id).header("Origin", ORIGIN))
                .andExpect(status().isUnauthorized());
        for (Member.Role role : new Member.Role[]{Member.Role.USER, Member.Role.OFFICER, Member.Role.VICE_PRESIDENT}) {
            mvc.perform(delete("/api/admin/hackathon/reviews/{id}", id).header("Origin", ORIGIN)
                            .cookie(account(role, role.name())))
                    .andExpect(status().isForbidden());
        }
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(delete("/api/admin/hackathon/reviews/{id}", id).cookie(admin))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/hackathon/reviews/{id}", id).header("Origin", ORIGIN).cookie(admin))
                .andExpect(status().isNoContent()).andExpect(jsonPath("$").doesNotExist());
        assertThat(reviews.count()).isEqualTo(1);
        assertThat(reviews.findAll().getFirst().getProjectId()).isEqualTo("wargether");
        mvc.perform(get("/api/admin/hackathon/reviews").cookie(admin))
                .andExpect(jsonPath("$.length()").value(1));
        submit("still", 3, "Alum").andExpect(status().isCreated());
        assertThat(reviews.count()).isEqualTo(2);
        mvc.perform(delete("/api/admin/hackathon/reviews/{id}", id).header("Origin", ORIGIN).cookie(admin))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("평가를 찾을 수 없습니다."));
    }

    @Test
    void chairReviewCanBeDeletedAndRecreatedWithoutTouchingAlumni() throws Exception {
        submit("still", 2, "Alum").andExpect(status().isCreated());
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/chair-reviews/still").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{" + SCORES + "}"))
                .andExpect(status().isOk());
        long chairId = reviews.findByProjectIdAndGenerationAndNameKey("still", 0, "chair").orElseThrow().getId();
        mvc.perform(delete("/api/admin/hackathon/reviews/{id}", chairId).cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        assertThat(reviews.count()).isEqualTo(1);
        assertThat(reviews.findAll().getFirst().isChair()).isFalse();
        mvc.perform(put("/api/admin/hackathon/chair-reviews/still").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{" + SCORES + "}"))
                .andExpect(status().isOk());
        assertThat(reviews.count()).isEqualTo(2);
    }

    @Test
    void chairAuthorsAnotherEventWithoutExposingItsDraftOrMixingReviews() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(get("/api/hackathon/events"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(1));
        String body = "{\"title\":\"2027년 1학기 해커톤\",\"year\":2027,\"semester\":1,\"introduction\":\"함께 만들어요\"}";
        MvcResult created = mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.title").value("2027년 1학기 해커톤")).andReturn();
        long eventId = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/hackathon/events/{id}", eventId)).andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"무단 팀\",\"author\":\"테스트\",\"description\":\"작품\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/hackathon/events/{id}/settings", eventId).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"open\":true}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/admin/hackathon/events/{id}/published", eventId).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"published\":true}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/hackathon/events/{id}", eventId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.projects.length()").value(0))
                .andExpect(jsonPath("$.reviews").doesNotExist());
        MvcResult project = mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"새 작품\",\"author\":\"테스트 팀\",\"description\":\"피난 지원 서비스\"}"))
                .andExpect(status().isCreated()).andReturn();
        String projectId = json.readTree(project.getResponse().getContentAsString()).get("projectId").asText();
        assertThat(projectId).isNotBlank();
        mvc.perform(put("/api/admin/hackathon/events/{id}/settings", eventId).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"open\":true}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/hackathon/events/{id}/reviews", eventId).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body(projectId, 42, "Same Member")))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/hackathon/events/{id}/guest-reviews", eventId).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"allowGuestReviews\":true}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/hackathon/events/{id}/reviews", eventId).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body(projectId, 42, "Same Member")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.projectId").value(projectId));
        mvc.perform(post("/api/hackathon/events/{id}/reviews", eventId).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body(projectId, 42, "Same Member")))
                .andExpect(status().isConflict());
        submit("wargether", 42, "Same Member").andExpect(status().isCreated());
        mvc.perform(get("/api/admin/hackathon/events/{id}/reviews", eventId).cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].eventId").value(eventId))
                .andExpect(jsonPath("$[0].projectId").value(projectId));
        mvc.perform(get("/api/admin/hackathon/reviews").cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].projectId").value("wargether"))
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(put("/api/admin/hackathon/events/{id}/published", eventId).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"published\":false}"))
                .andExpect(status().isConflict());
    }

    @Test
    void legacyMaterialsHaveFixedRedirectsAndUploadedPdfNeedsRealBytes() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        MvcResult event = mvc.perform(get("/api/hackathon/events/1")).andExpect(status().isOk()).andReturn();
        var eventJson = json.readTree(event.getResponse().getContentAsString());
        long opening = eventJson.get("materials").get(0).get("id").asLong();
        long pdf = eventJson.get("projects").get(0).get("materials").get(0).get("id").asLong();
        mvc.perform(get("/api/hackathon/events/1/materials/{id}", opening))
                .andExpect(status().isFound()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Location", "/hackathon-2026/opening.pptx"));
        mvc.perform(get("/api/hackathon/events/1/materials/{id}/inline.pdf", opening))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/hackathon/events/1/materials/{id}/inline.pdf", pdf))
                .andExpect(status().isFound());
        mvc.perform(get("/api/hackathon/events/2/materials/{id}", pdf))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/admin/hackathon/events/1/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isOk());
        mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                .file(new MockMultipartFile("file", "unsafe.pdf", "application/pdf", "not a PDF".getBytes(StandardCharsets.UTF_8)))
                .param("kind", "other").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadedDocumentsUseVerifiedTypesAndSupportVideoRanges() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/events/1/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isOk());
        byte[] pdfBytes = "%PDF-1.4\nverified document".getBytes(StandardCharsets.UTF_8);
        MvcResult pdf = mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                        .file(new MockMultipartFile("file", "document.pdf", "application/pdf", pdfBytes))
                        .param("kind", "proposal").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.mimeType").value("application/pdf"))
                .andReturn();
        long pdfId = json.readTree(pdf.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/hackathon/events/1/materials/{id}/inline.pdf", pdfId))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().doesNotExist("Content-Security-Policy"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Content-Type", "application/pdf"));
        mvc.perform(get("/api/hackathon/events/1/materials/{id}/inline.pdf", pdfId).header("Range", "bytes=0-3"))
                .andExpect(status().isPartialContent())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Content-Range", "bytes 0-3/" + pdfBytes.length));
        byte[] video = new byte[]{0, 0, 0, 20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 1, 2, 3, 4};
        MvcResult movie = mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                        .file(new MockMultipartFile("file", "demo.mp4", "video/mp4", video))
                        .param("kind", "video").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isCreated()).andReturn();
        long movieId = json.readTree(movie.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/hackathon/events/1/materials/{id}", movieId).header("Range", "bytes=0-7"))
                .andExpect(status().isPartialContent())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Content-Range", "bytes 0-7/16"));
        byte[] pptx = new byte[]{'P','K',3,4,0,0,0,0};
        MvcResult slides = mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                        .file(new MockMultipartFile("file", "slides.pptx", "application/octet-stream", pptx))
                        .param("kind", "presentation").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.mimeType")
                        .value("application/vnd.openxmlformats-officedocument.presentationml.presentation"))
                .andReturn();
        long slidesId = json.readTree(slides.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/hackathon/events/1/materials/{id}", slidesId))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")));
        for (long id : new long[]{pdfId, movieId, slidesId}) {
            mvc.perform(delete("/api/admin/hackathon/events/1/materials/{id}", id)
                    .cookie(admin).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        }
    }

    @Test
    void eventAndProjectWritingPreserveMultilineTextAndAppendAfterHighestPosition() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        MvcResult created = mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"2028년 1학기\",\"year\":2028,\"semester\":1,\"introduction\":\"첫 줄\\n둘째 줄\",\"rules\":\"규칙 A\\t규칙 B\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.introduction").value("첫 줄\n둘째 줄"))
                .andReturn();
        long eventId = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        MvcResult first = mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"첫 팀\",\"author\":\"팀원\",\"description\":\"설명 1\\n설명 2\",\"position\":10}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.description").value("설명 1\n설명 2"))
                .andReturn();
        String firstId = json.readTree(first.getResponse().getContentAsString()).get("projectId").asText();
        MvcResult second = mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"둘째 팀\",\"author\":\"팀원\",\"description\":\"설명\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.position").value(11)).andReturn();
        String secondId = json.readTree(second.getResponse().getContentAsString()).get("projectId").asText();
        mvc.perform(delete("/api/admin/hackathon/events/{id}/projects/{projectId}", eventId, firstId)
                .cookie(admin).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"셋째 팀\",\"author\":\"팀원\",\"description\":\"설명\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.position").value(12));
        mvc.perform(put("/api/admin/hackathon/events/{id}/projects/{projectId}", eventId, secondId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"둘째 팀 수정\",\"author\":\"팀원\",\"description\":\"설명\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.position").value(11));
        mvc.perform(put("/api/admin/hackathon/events/{id}/projects/{projectId}", eventId, secondId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"둘째 팀 수정\",\"author\":\"팀원\",\"description\":\"설명\",\"position\":9999}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId)
                .cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"넷째 팀\",\"author\":\"팀원\",\"description\":\"설명\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void fractionalEventNumbersAreRejectedAtTheRequestBoundary() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        for (String body : new String[]{
                "{\"title\":\"행사\",\"year\":2027.5,\"semester\":1}",
                "{\"title\":\"행사\",\"year\":2027,\"semester\":1.5}"
        }) {
            mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        MvcResult created = mvc.perform(post("/api/admin/hackathon/events").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"행사\",\"year\":2027,\"semester\":1}"))
                .andExpect(status().isCreated()).andReturn();
        long eventId = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(post("/api/admin/hackathon/events/{id}/projects", eventId).cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"팀\",\"author\":\"작성자\",\"description\":\"설명\",\"position\":1.5}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void genericMediaMimeCannotBypassImageVideoValidationOrSizeLimits() throws Exception {
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/events/1/settings").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"open\":false}"))
                .andExpect(status().isOk());
        byte[] hugePng = new byte[5 * 1024 * 1024 + 1];
        System.arraycopy(new byte[]{(byte) 0x89,'P','N','G'}, 0, hugePng, 0, 4);
        mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                .file(new MockMultipartFile("file", "oversized.png", "application/octet-stream", hugePng))
                .param("kind", "poster").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
        for (String type : new String[]{"application/octet-stream", "video/mp4"}) {
            mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                    .file(new MockMultipartFile("file", "fake.mp4", type, "not an MP4".getBytes(StandardCharsets.UTF_8)))
                    .param("kind", "video").cookie(admin).header("Origin", ORIGIN))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                .file(new MockMultipartFile("file", "fake.mp4", null, "not an MP4".getBytes(StandardCharsets.UTF_8)))
                .param("kind", "video").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/admin/hackathon/events/1/materials")
                .file(new MockMultipartFile("file", "fake.png", "video/mp4", "not a PNG".getBytes(StandardCharsets.UTF_8)))
                .param("kind", "poster").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    private ResultActions submit(String projectId, int generation, String name) throws Exception {
        return submitBody(body(projectId, generation, name));
    }

    private String body(String projectId, int generation, String name) {
        return "{\"projectId\":\"" + projectId + "\",\"generation\":" + generation + ",\"name\":\"" + name + "\"," + SCORES + "}";
    }

    private ResultActions submitBody(String body) throws Exception {
        return mvc.perform(post("/api/hackathon/reviews").header("Origin", ORIGIN)
                .with(request -> { request.setRemoteAddr(testIp); return request; })
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private Cookie account(Member.Role role, String studentId) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(studentId);
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        members.saveAndFlush(member);
        return new Cookie("token", tokens.generateToken(studentId, member.getTokenVersion()));
    }
}
