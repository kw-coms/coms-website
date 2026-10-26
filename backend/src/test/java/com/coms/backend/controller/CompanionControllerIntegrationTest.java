package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.BannedStudentService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:companion-member-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class CompanionControllerIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired MemberRepository memberRepository;
    @Autowired EligibleMemberRepository eligibleRepository;
    @Autowired JwtTokenProvider tokenProvider;
    @Autowired BannedStudentService bannedStudentService;

    @Test
    void currentAccountReturnsOnlyItsRosterIdentity() throws Exception {
        EligibleMember row = roster("2026123456", null);
        Cookie cookie = account("2026123456", true, Member.Role.USER);
        mockMvc.perform(get("/api/companion/me").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("coms-eligible-members"))
                .andExpect(jsonPath("$.sourceId").value(row.getId().toString()))
                .andExpect(jsonPath("$.name").value("테스트회원"))
                .andExpect(jsonPath("$.studentId").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist());
    }

    @Test
    void legacyMemberIdAlsoUsesExactRosterMatch() throws Exception {
        EligibleMember row = roster("19991234", null);
        mockMvc.perform(get("/api/companion/me").cookie(account("19991234", true, Member.Role.USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceId").value(row.getId().toString()));
    }

    @Test
    void graduateAccountUsesExactRosterIdAndAdmissionYear() throws Exception {
        EligibleMember row = roster(null, 2017);
        Cookie cookie = account("G2017-" + row.getId(), true, Member.Role.USER);
        mockMvc.perform(get("/api/companion/me").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceId").value(row.getId().toString()));
    }

    @Test
    void graduateClaimedRosterIdIsAcceptedWhenYearAndIdAgree() throws Exception {
        EligibleMember row = roster(null, 2017);
        String accountId = "G2017-" + row.getId();
        row.setStudentId(accountId);
        eligibleRepository.saveAndFlush(row);
        mockMvc.perform(get("/api/companion/me").cookie(account(accountId, true, Member.Role.USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceId").value(row.getId().toString()));
    }

    @Test
    void rejectsUnmatchedOrIncorrectGraduateMapping() throws Exception {
        EligibleMember row = roster(null, 2017);
        EligibleMember currentRow = roster("2026123456", 2017);
        roster("G2017-" + row.getId(), 2017);
        mockMvc.perform(get("/api/companion/me").cookie(account("2026999999", true, Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("SYSTEM_ADMIN", true, Member.Role.ADMIN)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("G2016-" + row.getId(), true, Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("G2017-000" + row.getId(), true, Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("G2017-" + currentRow.getId(), true, Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("G2017-" + row.getId(), true, Member.Role.USER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsUnverifiedAndBannedSessionsButAcceptsRegisteredAssociate() throws Exception {
        roster("2026123457", null);
        roster("2026123458", null);
        roster("2026123459", null);
        mockMvc.perform(get("/api/companion/me").cookie(account("2026123457", false, Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/companion/me").cookie(account("2026123458", true, Member.Role.ASSOCIATE)))
                .andExpect(status().isOk());
        Cookie bannedCookie = account("2026123459", true, Member.Role.USER);
        bannedStudentService.ban("2026123459", "6H");
        mockMvc.perform(get("/api/companion/me").cookie(bannedCookie))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anonymousRequestCannotReadRosterIdentity() throws Exception {
        mockMvc.perform(get("/api/companion/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/companion/me").cookie(new Cookie("token", "not-a-jwt")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredAndRevokedAccessTokensAreUnauthorized() throws Exception {
        roster("2026123461", null);
        Cookie valid = account("2026123461", true, Member.Role.USER);
        JwtTokenProvider expiredIssuer = new JwtTokenProvider("test-secret-key-with-at-least-32-chars", -1000);
        mockMvc.perform(get("/api/companion/me").cookie(
                new Cookie("token", expiredIssuer.generateToken("2026123461", 0))))
                .andExpect(status().isUnauthorized());
        Member member = memberRepository.findByStudentId("2026123461").orElseThrow();
        member.incrementTokenVersion();
        memberRepository.saveAndFlush(member);
        mockMvc.perform(get("/api/companion/me").cookie(valid)).andExpect(status().isUnauthorized());
    }

    @Test
    void administratorKeepsExistingEmailVerificationException() throws Exception {
        EligibleMember row = roster("2026123460", null);
        mockMvc.perform(get("/api/companion/me").cookie(account("2026123460", false, Member.Role.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceId").value(row.getId().toString()));
    }

    private EligibleMember roster(String studentId, Integer year) {
        EligibleMember row = new EligibleMember();
        row.setStudentId(studentId);
        row.setAdmissionYear(year);
        row.setName("테스트회원");
        return eligibleRepository.saveAndFlush(row);
    }

    private Cookie account(String studentId, boolean verified, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("테스트회원");
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setEmailVerified(verified);
        member.setRole(role);
        memberRepository.saveAndFlush(member);
        return new Cookie("token", tokenProvider.generateToken(studentId, member.getTokenVersion()));
    }
}
