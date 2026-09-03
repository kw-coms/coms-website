package com.coms.backend.config;

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
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 후원자 경계: 공개 읽기는 로그아웃 상태에서도 열려 있고, 관리 API 는 회장(ADMIN) 전용이다.
 * 부회장(VICE_PRESIDENT)이 403 을 받는지 확인하는 것이 핵심 — {@code /api/admin/community/**}
 * 처럼 부회장 매처가 후원자 경로까지 덮지 않아야 한다.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:sponsor-security-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class SponsorSecurityIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String SPONSOR_BODY = "{\"name\":\"후원사\"}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private Cookie userCookie;
    private Cookie vicePresidentCookie;
    private Cookie adminCookie;

    @BeforeEach
    void setUp() {
        memberRepository.deleteAll();
        memberRepository.save(member("2026000011", Member.Role.USER));
        memberRepository.save(member("2026000012", Member.Role.VICE_PRESIDENT));
        memberRepository.save(member("2026000013", Member.Role.ADMIN));
        userCookie = authCookie("2026000011");
        vicePresidentCookie = authCookie("2026000012");
        adminCookie = authCookie("2026000013");
    }

    @Test
    void publicSponsorReadsAreOpenToLoggedOutVisitors() throws Exception {
        mockMvc.perform(get("/api/sponsors")).andExpect(status().isOk());
        mockMvc.perform(get("/api/sponsors/page")).andExpect(status().isOk());
    }

    @Test
    void onlyThePresidentMayManageSponsors() throws Exception {
        mockMvc.perform(post("/api/admin/sponsors")
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(SPONSOR_BODY))
                // 로그아웃 상태는 403 — 이 앱의 필터 체인은 익명 요청에 401 진입점을 쓰지 않는다.
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/admin/sponsors")
                        .cookie(userCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(SPONSOR_BODY))
                .andExpect(status().isForbidden());

        // 부회장은 커뮤니티 모더레이션만 담당한다 — 후원자 장부는 회장 전용.
        mockMvc.perform(post("/api/admin/sponsors")
                        .cookie(vicePresidentCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(SPONSOR_BODY))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/sponsors").cookie(vicePresidentCookie))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/sponsors/export.csv").cookie(vicePresidentCookie))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/admin/sponsors")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(SPONSOR_BODY))
                .andExpect(status().isCreated());
        mockMvc.perform(get("/api/admin/sponsors").cookie(adminCookie)).andExpect(status().isOk());
    }

    @Test
    void pageSettingsRejectUnknownKeysAndInvalidColours() throws Exception {
        mockMvc.perform(put("/api/admin/sponsors/page")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"heroTitle\":\"후원자\",\"totallyUnknown\":true}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(put("/api/admin/sponsors/page")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accentColor\":\"rgb(1,2,3)\"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(put("/api/admin/sponsors/page")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accentColor\":\"#112233\",\"layout\":\"list\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void reorderPathsResolveAheadOfTheIdPathVariable() throws Exception {
        // /reorder 와 /{id} 는 같은 자리를 두고 겨루므로, 리터럴 경로가 먼저 잡히는지
        // HTTP 수준에서 못박아 둔다 — {id} 로 새면 Long 파싱 실패로 400 이 된다.
        mockMvc.perform(patch("/api/admin/sponsors/reorder")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[]}"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/api/admin/sponsors/tiers/reorder")
                        .cookie(adminCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[]}"))
                .andExpect(status().isOk());
    }

    private Cookie authCookie(String studentId) {
        return new Cookie("token", jwtTokenProvider.generateToken(studentId, 0));
    }

    private Member member(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(role.name());
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
