package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.MemberPermissionOverrideRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:member-permission-overrides-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class MemberPermissionOverrideIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired MemberPermissionOverrideRepository overrides;
    @Autowired AuditLogRepository auditLogs;
    @Autowired JwtTokenProvider tokens;

    private Cookie admin;
    private Cookie user;

    @BeforeEach
    void setUp() {
        overrides.deleteAll();
        members.deleteAll();
        members.save(member("2026000001", Member.Role.ADMIN));
        members.save(member("2026000002", Member.Role.USER));
        admin = cookie("2026000001");
        user = cookie("2026000002");
    }

    @Test
    void grantAndRevokeTakeEffectOnTheNextRequestAndAreAudited() throws Exception {
        mvc.perform(get("/api/permissions/me").cookie(user))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("archive.delete"))))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItem("club_room.view")));
        mvc.perform(get("/api/club-room").cookie(user)).andExpect(status().isOk());

        replace("{\"overrides\":{\"archive.delete\":\"GRANT\",\"club_room.view\":\"REVOKE\"}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrides['archive.delete']").value("GRANT"));
        mvc.perform(get("/api/permissions/me").cookie(user))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItem("archive.delete")))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("club_room.view"))));
        mvc.perform(get("/api/club-room").cookie(user)).andExpect(status().isForbidden());

        replace("{\"overrides\":{}}")
                .andExpect(status().isOk());
        mvc.perform(get("/api/permissions/me").cookie(user))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("archive.delete"))))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItem("club_room.view")));
        mvc.perform(get("/api/club-room").cookie(user)).andExpect(status().isOk());
        assertThat(auditLogs.findAll()).anySatisfy(log -> {
            assertThat(log.getAction()).isEqualTo("MEMBER_PERMISSION_OVERRIDE_UPDATE");
            assertThat(log.getActorStudentId()).isEqualTo("2026000001");
            assertThat(log.getTargetId()).isEqualTo("2026000002");
        });
    }

    @Test
    void onlyAdminCanEditAndAdminCannotBeRevoked() throws Exception {
        mvc.perform(put("/api/admin/permissions/overrides/2026000002")
                        .cookie(user).header("Origin", "https://coms.kw.ac.kr")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"overrides\":{\"archive.delete\":\"GRANT\"}}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/permissions/overrides/2026000002")
                        .header("Origin", "https://coms.kw.ac.kr")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"overrides\":{\"archive.delete\":\"GRANT\"}}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/permissions/overrides/2026000001")
                        .cookie(admin).header("Origin", "https://coms.kw.ac.kr")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"overrides\":{\"archive.delete\":\"REVOKE\"}}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/permissions/me").cookie(admin))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItem("archive.delete")));
    }

    @Test
    void storedRevokeCannotRemoveAdminPermissions() throws Exception {
        overrides.saveAndFlush(new com.coms.backend.domain.MemberPermissionOverride("2026000001",
                com.coms.backend.domain.Permission.CLUB_ROOM_VIEW,
                com.coms.backend.domain.MemberPermissionOverride.Effect.REVOKE, "2026000001"));
        mvc.perform(get("/api/permissions/me").cookie(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItem("club_room.view")));
        mvc.perform(get("/api/club-room").cookie(admin)).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions replace(String json) throws Exception {
        return mvc.perform(put("/api/admin/permissions/overrides/2026000002")
                .cookie(admin).header("Origin", "https://coms.kw.ac.kr")
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private Cookie cookie(String studentId) {
        return new Cookie("token", tokens.generateToken(studentId, 0));
    }

    private Member member(String id, Member.Role role) {
        Member member = new Member();
        member.setStudentId(id);
        member.setName("테스트 " + id);
        member.setEmail(id + "@example.com");
        member.setPassword("pw");
        member.setRole(role);
        return member;
    }
}
