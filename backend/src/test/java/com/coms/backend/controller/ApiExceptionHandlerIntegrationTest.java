package com.coms.backend.controller;

import com.coms.backend.domain.Member;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:missing-resource-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "springdoc.api-docs.enabled=false",
        "springdoc.swagger-ui.enabled=false"
})
@AutoConfigureMockMvc
class ApiExceptionHandlerIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String MEMBER_STUDENT_ID = "2026000101";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private Cookie memberCookie;

    @BeforeEach
    void setUp() {
        if (!memberRepository.existsByStudentId(MEMBER_STUDENT_ID)) {
            Member member = new Member();
            member.setStudentId(MEMBER_STUDENT_ID);
            member.setName("테스트회원");
            member.setEmail(MEMBER_STUDENT_ID + "@example.com");
            member.setPassword("unused");
            member.setRole(Member.Role.USER);
            member.setEmailVerified(true);
            memberRepository.save(member);
        }
        memberCookie = new Cookie("token", jwtTokenProvider.generateToken(MEMBER_STUDENT_ID, 0));
    }

    @Test
    void disabledApiDocsReturnNotFoundInsteadOfServerError() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isNotFound());
    }

    // The requests below are the caller's mistake. Each used to fall through to the catch-all and
    // come back as HTTP 500 with an error-level stack trace.

    @Test
    void wrongHttpMethodIsMethodNotAllowed() throws Exception {
        mockMvc.perform(get("/api/auth/login"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void unsupportedRequestContentTypeIsUnsupportedMediaType() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("identifier=someone"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void multipartUploadWithoutFilePartIsBadRequest() throws Exception {
        mockMvc.perform(multipart("/api/files")
                        .param("title", "파일 없는 업로드")
                        .cookie(memberCookie)
                        .header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonMultipartUploadIsBadRequest() throws Exception {
        mockMvc.perform(post("/api/files")
                        .cookie(memberCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void outOfRangeCalendarYearIsBadRequest() throws Exception {
        mockMvc.perform(get("/api/club-activities/schedule")
                        .param("year", "1000000000")
                        .param("month", "1")
                        .cookie(memberCookie))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/club-activities/schedule")
                        .param("year", "2026")
                        .param("month", "10")
                        .cookie(memberCookie))
                .andExpect(status().isOk());
    }

    @Test
    void missingRequiredQueryParameterIsBadRequest() throws Exception {
        mockMvc.perform(get("/api/club-activities/schedule")
                        .param("month", "10")
                        .cookie(memberCookie))
                .andExpect(status().isBadRequest());
    }
}
