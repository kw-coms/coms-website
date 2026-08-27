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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:operations-security-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class OperationsSecurityIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private Cookie officerCookie;
    private Cookie userCookie;
    private Cookie vicePresidentCookie;
    private Cookie associateCookie;

    @BeforeEach
    void setUp() {
        memberRepository.deleteAll();
        memberRepository.save(member("2026000001", Member.Role.OFFICER));
        memberRepository.save(member("2026000002", Member.Role.USER));
        memberRepository.save(member("2026000003", Member.Role.VICE_PRESIDENT));
        memberRepository.save(member("2026000004", Member.Role.ASSOCIATE));
        officerCookie = authCookie("2026000001");
        userCookie = authCookie("2026000002");
        vicePresidentCookie = authCookie("2026000003");
        associateCookie = authCookie("2026000004");
    }

    @Test
    void clubRoomCodeIsMemberPlusWhileAssociatesStayOut() throws Exception {
        // 준회원 = identical to 회원 everywhere except below-USER gates: they can
        // read notices, but the club-room door code is 403.
        mockMvc.perform(get("/api/notices").cookie(associateCookie))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/club-room").cookie(associateCookie))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/club-room").cookie(userCookie))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/club-room").cookie(officerCookie))
                .andExpect(status().isOk());

        // 임원+ may rotate the code; 회원 may not.
        mockMvc.perform(put("/api/admin/club-room")
                        .cookie(userCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doorCode\":\"0000\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/admin/club-room")
                        .cookie(officerCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doorCode\":\"0000\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void publicSettingsStayPublicWhileNoticesRequireMembership() throws Exception {
        mockMvc.perform(get("/api/site-settings"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/notices"))
                .andExpect(status().isForbidden());
    }

    @Test
    void regularMemberCannotPublishNotice() throws Exception {
        mockMvc.perform(post("/api/notices")
                        .cookie(userCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void officerCanReachContentWritesButNotSensitiveAdminApis() throws Exception {
        mockMvc.perform(post("/api/notices")
                        .cookie(officerCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"임원 공지","content":"운영 안내","pinned":false,"category":"GENERAL"}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/admin/site-settings").cookie(officerCookie))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/admin/members").cookie(officerCookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void vicePresidentInheritsOfficerContentWritesViaRoleHierarchy() throws Exception {
        // The RoleHierarchy bean must make hasAnyRole("ADMIN","OFFICER") admit
        // VICE_PRESIDENT — this is the load-bearing assumption of the tier split.
        mockMvc.perform(post("/api/notices")
                        .cookie(vicePresidentCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"부회장 공지","content":"운영 안내","pinned":false,"category":"GENERAL"}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/admin/members").cookie(vicePresidentCookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void archiveAuthorEditIsVicePresidentPlusOnly() throws Exception {
        mockMvc.perform(patch("/api/files/1/author")
                        .cookie(userCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uploaderName\":\"홍길동\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/files/1/author")
                        .cookie(officerCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uploaderName\":\"홍길동\"}"))
                .andExpect(status().isForbidden());

        // VP passes the security gate; 404 because file 1 doesn't exist here.
        mockMvc.perform(patch("/api/files/1/author")
                        .cookie(vicePresidentCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"uploaderName\":\"홍길동\"}"))
                .andExpect(status().isNotFound());
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
