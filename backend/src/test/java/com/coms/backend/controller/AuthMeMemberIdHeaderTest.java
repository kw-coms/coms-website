package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Circuit Lab's nginx (nginx.frontend.conf) reads X-Member-Id from its internal auth_request to
 * /api/auth/me and uses it as the key of the member's compile rate limit. It must be the caller's own
 * id, only on a successful /me, and never on a rejected request.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:auth-me-member-id-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class AuthMeMemberIdHeaderTest {
    @Autowired MockMvc mockMvc;
    @Autowired MemberRepository memberRepository;
    @Autowired JwtTokenProvider tokenProvider;

    @Test
    void meReturnsTheCallersOwnIdInAHeader() throws Exception {
        mockMvc.perform(get("/api/auth/me").cookie(account("2026123499")))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Member-Id", "2026123499"));
    }

    @Test
    void rejectedRequestsGetNoMemberId() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Member-Id"));
        mockMvc.perform(get("/api/auth/me").cookie(new Cookie("token", "not-a-jwt")))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("X-Member-Id"));
    }

    private Cookie account(String studentId) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("테스트회원");
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setEmailVerified(true);
        member.setRole(Member.Role.USER);
        memberRepository.saveAndFlush(member);
        return new Cookie("token", tokenProvider.generateToken(studentId, member.getTokenVersion()));
    }
}
