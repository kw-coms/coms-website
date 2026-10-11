package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Exercises separate HTTP/service transactions so a rejected request cannot hide a rolled-back counter. */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "auth.trusted-proxy-ips=172.18.0.1",
        "spring.datasource.url=jdbc:h2:mem:auth-abuse-limit-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class AuthAbuseLimitIntegrationTest {
    private static final String STUDENT_ID = "2026123488";

    @Autowired private MockMvc mockMvc;
    @Autowired private AuthService authService;
    @Autowired private MemberRepository memberRepository;
    @Autowired private LoginFailureRepository loginFailureRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        loginFailureRepository.deleteAll();
        memberRepository.deleteAll();
        Member member = new Member();
        member.setStudentId(STUDENT_ID);
        member.setName("테스트 회원");
        member.setEmail("auth-abuse-limit@example.com");
        member.setEmailVerified(true);
        member.setPassword(passwordEncoder.encode("Password1!"));
        member.setRole(Member.Role.USER);
        memberRepository.save(member);
    }

    @Test
    void wrongPasswordsPersistAndTriggerLoginLockout() throws Exception {
        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/auth/login")
                            .header(HttpHeaders.ORIGIN, "https://coms.kw.ac.kr")
                            .header("X-Real-IP", "203.0.113.10")
                            .with(request -> { request.setRemoteAddr("172.18.0.1"); return request; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"identifier\":\"" + STUDENT_ID + "\",\"password\":\"WrongPassword1!\"}"))
                    .andExpect(status().isUnauthorized());
        }
        assertThat(loginFailureRepository.count()).isEqualTo(5);
        mockMvc.perform(post("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, "https://coms.kw.ac.kr")
                        .header("X-Real-IP", "203.0.113.10")
                        .with(request -> { request.setRemoteAddr("172.18.0.1"); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"" + STUDENT_ID + "\",\"password\":\"WrongPassword1!\"}"))
                .andExpect(status().isTooManyRequests());

        Member other = new Member();
        other.setStudentId("2026123489");
        other.setName("다른 회원");
        other.setEmail("other-auth-abuse-limit@example.com");
        other.setEmailVerified(true);
        other.setPassword(passwordEncoder.encode("Password1!"));
        other.setRole(Member.Role.USER);
        memberRepository.save(other);
        mockMvc.perform(post("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, "https://coms.kw.ac.kr")
                        .header("X-Real-IP", "203.0.113.11")
                        .with(request -> { request.setRemoteAddr("172.18.0.1"); return request; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"2026123489\",\"password\":\"Password1!\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void wrongPasswordResetCodePersistsAttempt() {
        Member member = memberRepository.findByStudentId(STUDENT_ID).orElseThrow();
        member.setPasswordResetCodeHash(passwordEncoder.encode("123456"));
        member.setPasswordResetExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);

        for (int attempt = 1; attempt <= 5; attempt++) {
            assertThatThrownBy(() -> authService.confirmPasswordReset(STUDENT_ID, member.getEmail(), "000000", "NewPassword1!", "198.51.100.7"))
                    .isInstanceOf(ResponseStatusException.class);
            assertThat(memberRepository.findByStudentId(STUDENT_ID).orElseThrow().getPasswordResetAttempts()).isEqualTo(attempt);
        }
        assertThat(memberRepository.findByStudentId(STUDENT_ID).orElseThrow().getPasswordResetCodeHash()).isNull();
    }

    @Test
    void wrongEmailVerificationCodePersistsAttempt() {
        Member member = memberRepository.findByStudentId(STUDENT_ID).orElseThrow();
        member.setEmailVerified(false);
        member.setEmailVerificationCodeHash(passwordEncoder.encode("123456"));
        member.setEmailVerificationExpiresAt(LocalDateTime.now().plusMinutes(10));
        memberRepository.save(member);

        for (int attempt = 1; attempt <= 5; attempt++) {
            assertThatThrownBy(() -> authService.confirmEmailVerification(STUDENT_ID, "000000"))
                    .isInstanceOf(ResponseStatusException.class);
            assertThat(memberRepository.findByStudentId(STUDENT_ID).orElseThrow().getEmailVerificationAttempts()).isEqualTo(attempt);
        }
        assertThat(memberRepository.findByStudentId(STUDENT_ID).orElseThrow().getEmailVerificationCodeHash()).isNull();
    }
}
