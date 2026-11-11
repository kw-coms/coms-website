package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.SiteSettings;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.SiteSettingsRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.SiteSettingsService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Locale;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://example.com",
        "spring.datasource.url=jdbc:h2:mem:ask-security-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=true",
        "mail.from=sender@example.com"
})
@AutoConfigureMockMvc
@Transactional
class AskSecurityIntegrationTest {
    private static final String ORIGIN = "https://example.com";
    private static final String QUESTION = """
            {"question":"질문입니다","replyEmail":"guest@example.com","name":"Guest","honeypot":"","pagePath":"/"}
            """;

    @Autowired MockMvc mockMvc;
    @Autowired SiteSettingsRepository settingsRepository;
    @Autowired SiteSettingsService settingsService;
    @Autowired MemberRepository memberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @MockitoBean JavaMailSender mailSender;

    @BeforeEach
    void setUp() {
        settingsService.current();
        SiteSettings settings = settingsRepository.findById(1L).orElseThrow();
        settings.setContactLinksJson("[{\"label\":\"Mail\",\"href\":\"mailto:test@example.com\"}]");
        settings.setAskInboxEmail("inbox@example.com");
        settingsRepository.saveAndFlush(settings);
    }

    @Test
    void publicSettingsExposeOnlyEnabledFlagAndAdminInboxNeedsPermission() throws Exception {
        String publicJson = mockMvc.perform(get("/api/site-settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.askEnabled").value(true))
                .andReturn().getResponse().getContentAsString();
        assertNoInbox(JsonMapper.builder().build().readTree(publicJson));
        mockMvc.perform(get("/api/admin/site-settings"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/site-settings").cookie(account(Member.Role.USER, "2026000001")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/site-settings").cookie(account(Member.Role.OFFICER, "2026000002")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.askInboxEmail").value("inbox@example.com"));
    }

    @Test
    void guestAskRequiresTrustedOriginAndConfiguredInbox() throws Exception {
        mockMvc.perform(post("/api/ask").contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/ask").header("Origin", "https://untrusted.example")
                        .contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                .andExpect(status().isNoContent());
        verify(mailSender).send(any(SimpleMailMessage.class));

        SiteSettings settings = settingsRepository.findById(1L).orElseThrow();
        settings.setAskInboxEmail("");
        settingsRepository.saveAndFlush(settings);
        mockMvc.perform(get("/api/site-settings"))
                .andExpect(jsonPath("$.askEnabled").value(false));
        mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void httpValidationUsesTrimmedQuestionLengthAndSilentlyAcceptsHoneypot() throws Exception {
        for (String body : new String[]{
                QUESTION.replace("질문입니다", "abcd"),
                QUESTION.replace("질문입니다", "x".repeat(2001))
        }) {
            mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"honeypot\":\"robot\"}"))
                .andExpect(status().isNoContent());
        org.mockito.Mockito.verifyNoInteractions(mailSender);
        mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUESTION.replace("질문입니다", "  " + "x".repeat(2000) + "  ")))
                .andExpect(status().isNoContent());
    }

    @Test
    void oldAdminPayloadPreservesInboxAndUpdatesExistingFields() throws Exception {
        Cookie officer = account(Member.Role.OFFICER, "2026000014");
        for (String optional : new String[]{"", ",\"askInboxEmail\":null"}) {
            String body = """
                    {"semesterLabel":"Changed semester","recruitmentStatus":"모집 중",
                     "recruitmentPeriod":"새 기간","homeHeroTitle":"New title",
                     "homeHeroCopy":"New copy","contactLinks":[{"label":"Web","href":"https://example.com"}]%s}
                    """.formatted(optional);
            mockMvc.perform(put("/api/admin/site-settings").cookie(officer).header("Origin", ORIGIN)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.askInboxEmail").value("inbox@example.com"))
                    .andExpect(jsonPath("$.semesterLabel").value("Changed semester"))
                    .andExpect(jsonPath("$.contactLinks[0].label").value("Web"));
        }
        String publicJson = mockMvc.perform(get("/api/site-settings"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertNoInbox(JsonMapper.builder().build().readTree(publicJson));
    }

    @Test
    void trustedProxyClientIpControlsAskLimitAndIgnoresForwardedFor() throws Exception {
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                            .header("X-Real-IP", "198.51.100.18")
                            .header("X-Forwarded-For", "198.51.100." + i)
                            .contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                    .andExpect(status().isNoContent());
        }
        mockMvc.perform(post("/api/ask").header("Origin", ORIGIN)
                        .header("X-Real-IP", "198.51.100.18")
                        .header("X-Forwarded-For", "198.51.100.99")
                        .contentType(MediaType.APPLICATION_JSON).content(QUESTION))
                .andExpect(status().isTooManyRequests());
        verify(mailSender, times(3)).send(any(SimpleMailMessage.class));
    }

    private static void assertNoInbox(JsonNode node) {
        if (node.isObject()) {
            node.properties().forEach(entry -> {
                org.assertj.core.api.Assertions.assertThat(entry.getKey().toLowerCase(Locale.ROOT).replaceAll("[^a-z]", ""))
                        .doesNotContain("askinbox", "inboxemail");
                assertNoInbox(entry.getValue());
            });
        } else if (node.isArray()) {
            node.forEach(AskSecurityIntegrationTest::assertNoInbox);
        } else if (node.isTextual()) {
            org.assertj.core.api.Assertions.assertThat(node.asText().toLowerCase(Locale.ROOT))
                    .doesNotContain("inbox@example.com");
        }
    }

    @Test
    void officerCanEditInboxButMemberCannot() throws Exception {
        String body = """
                {"semesterLabel":"Semester","recruitmentStatus":"모집 예정","recruitmentPeriod":"별도 공지",
                 "homeHeroTitle":"COM's","homeHeroCopy":"함께 공부합니다.",
                 "contactLinks":[{"label":"Mail","href":"mailto:test@example.com"}],
                 "askInboxEmail":"new-inbox@example.com"}
                """;
        mockMvc.perform(put("/api/admin/site-settings").cookie(account(Member.Role.USER, "2026000003"))
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/admin/site-settings").cookie(account(Member.Role.OFFICER, "2026000004"))
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.askInboxEmail").value("new-inbox@example.com"));
        mockMvc.perform(get("/api/site-settings"))
                .andExpect(jsonPath("$.askInboxEmail").doesNotExist());
    }

    private Cookie account(Member.Role role, String studentId) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("Test Member");
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        memberRepository.saveAndFlush(member);
        return new Cookie("token", jwtTokenProvider.generateToken(studentId, member.getTokenVersion()));
    }
}
