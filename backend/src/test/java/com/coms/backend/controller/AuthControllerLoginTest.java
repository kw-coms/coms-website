package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.LoginRequest;
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
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-level login coverage through the real Jackson deserialization layer. Older cached
 * clients post payloads without {@code rememberMe}; with a primitive {@code boolean} record
 * component Jackson 3 turned that into HTTP 500 in production, which no service-level test
 * could catch.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:auth-controller-login-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class AuthControllerLoginTest {

    private static final String STUDENT_ID = "2026123499";
    private static final String ORIGIN = "https://coms.kw.ac.kr";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        memberRepository.deleteAll();
        Member member = new Member();
        member.setStudentId(STUDENT_ID);
        member.setName("홍길동");
        member.setEmail(STUDENT_ID + "@example.com");
        member.setEmailVerified(true);
        member.setPassword(passwordEncoder.encode("Password1!"));
        member.setRole(Member.Role.USER);
        memberRepository.save(member);
    }

    @Test
    void loginSucceedsWhenRememberMeIsOmitted() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"" + STUDENT_ID + "\",\"password\":\"Password1!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.studentId").value(STUDENT_ID));
    }

    @Test
    void loginRejectsWrongPasswordWithUserFacingMessage() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"" + STUDENT_ID + "\",\"password\":\"WrongPassword1!\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("아이디 또는 비밀번호가 올바르지 않습니다."));
    }

    @Test
    void missingRememberMeNormalizesToFalse() {
        assertThat(new LoginRequest("a", "b", null).rememberMe()).isFalse();
    }
}
