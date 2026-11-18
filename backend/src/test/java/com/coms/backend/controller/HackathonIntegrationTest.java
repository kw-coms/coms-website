package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.HackathonSettings;
import com.coms.backend.repository.HackathonReviewRepository;
import com.coms.backend.repository.HackathonSettingsRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

    @Autowired MockMvc mvc;
    @Autowired HackathonReviewRepository reviews;
    @Autowired HackathonSettingsRepository settings;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void reset() {
        reviews.deleteAll();
        settings.deleteAll();
        settings.saveAndFlush(new HackathonSettings());
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
    void invalidOrMissingScoresAndIdentityAreRejected() throws Exception {
        submitBody("{\"projectId\":\"wargether\",\"generation\":2,\"name\":\"Ann\"," +
                SCORES.replace("\"themeFit\":18", "\"themeFit\":21") + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"unknown\",\"generation\":2,\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":0,\"name\":\"Ann\"," + SCORES + "}")
                .andExpect(status().isBadRequest());
        submitBody("{\"projectId\":\"wargether\",\"generation\":61,\"name\":\"Ann\"," + SCORES + "}")
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
    void missingSettingsFailClosedUntilAdminRestoresThem() throws Exception {
        settings.deleteAll();
        mvc.perform(get("/api/hackathon")).andExpect(jsonPath("$.open").value(false));
        submit("still", 2, "Alum").andExpect(status().isConflict());
        Cookie admin = account(Member.Role.ADMIN, "chair");
        mvc.perform(put("/api/admin/hackathon/settings").cookie(admin).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"open\":true}"))
                .andExpect(status().isOk());
        submit("still", 2, "Alum").andExpect(status().isCreated());
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
    void closingAndSubmittingShareThePersistedSettingsLock() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(1);
        try {
            var closing = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                HackathonSettings state = settings.lockState().orElseThrow();
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

    private ResultActions submit(String projectId, int generation, String name) throws Exception {
        return submitBody(body(projectId, generation, name));
    }

    private String body(String projectId, int generation, String name) {
        return "{\"projectId\":\"" + projectId + "\",\"generation\":" + generation + ",\"name\":\"" + name + "\"," + SCORES + "}";
    }

    private ResultActions submitBody(String body) throws Exception {
        return mvc.perform(post("/api/hackathon/reviews").header("Origin", ORIGIN)
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
