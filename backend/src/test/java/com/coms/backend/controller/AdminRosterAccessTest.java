package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.AuditLogRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:admin-roster-access-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class AdminRosterAccessTest {
    @Autowired MockMvc mockMvc;
    @Autowired EligibleMemberRepository rosterRepository;
    @Autowired MemberRepository memberRepository;
    @Autowired AuditLogRepository auditLogRepository;
    @Autowired JwtTokenProvider tokenProvider;

    @Test
    void accountSourcedRosterFieldsAreVisibleOnlyToAdmin() throws Exception {
        EligibleMember roster = new EligibleMember();
        roster.setName("가상회원");
        roster.setPhone("010-0000-0001");
        rosterRepository.saveAndFlush(roster);

        Member source = new Member();
        source.setStudentId("2026991001");
        source.setName("가상회원");
        source.setPhone("01000000001");
        source.setEmail("test@example.com");
        source.setPassword("unused");
        memberRepository.saveAndFlush(source);

        mockMvc.perform(get("/api/admin/eligible-members"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(account("2026991002", Member.Role.USER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(account("2026991005", Member.Role.ASSOCIATE)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(account("2026991003", Member.Role.OFFICER)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(account("2026991006", Member.Role.VICE_PRESIDENT)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(account("2026991004", Member.Role.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].studentId").isEmpty())
                .andExpect(jsonPath("$[0].studentIdFromAccount").value(false))
                .andExpect(jsonPath("$[0].email").isEmpty())
                .andExpect(jsonPath("$[0].emailFromAccount").value(false))
                .andExpect(jsonPath("$[0].suggestedMemberId").value(source.getId()))
                .andExpect(jsonPath("$[0].suggestedStudentId").value("2026991001"))
                .andExpect(jsonPath("$[0].suggestedEmail").value("test@example.com"));

        String url = "/api/admin/roster/" + roster.getId() + "/apply-suggestion";
        String body = "{\"memberId\":" + source.getId() + "}";
        mockMvc.perform(post(url).header("Origin", "http://localhost:5173")
                        .contentType("application/json").content(body))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(url).cookie(account("2026991007", Member.Role.USER)).header("Origin", "http://localhost:5173")
                        .contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(url).cookie(account("2026991008", Member.Role.OFFICER)).header("Origin", "http://localhost:5173")
                        .contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        Cookie admin = account("2026991009", Member.Role.ADMIN);
        mockMvc.perform(post(url).cookie(admin).header("Origin", "http://localhost:5173")
                        .contentType("application/json").content(body))
                .andExpect(status().isNoContent());
        mockMvc.perform(post(url).cookie(admin).header("Origin", "http://localhost:5173")
                        .contentType("application/json").content(body))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/admin/eligible-members").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].studentId").value("2026991001"))
                .andExpect(jsonPath("$[0].email").value("test@example.com"))
                .andExpect(jsonPath("$[0].suggestedMemberId").isEmpty());
        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findAll())
                .filteredOn(log -> "appliedAccountId=".concat(source.getId().toString()).equals(log.getDetail()))
                .hasSize(1);
    }

    private Cookie account(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("가상회원");
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setEmailVerified(true);
        member.setRole(role);
        memberRepository.saveAndFlush(member);
        return new Cookie("token", tokenProvider.generateToken(studentId, member.getTokenVersion()));
    }
}
