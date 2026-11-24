package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.MemberPermissionOverride;
import com.coms.backend.domain.Permission;
import com.coms.backend.dto.ClubFormDto;
import com.coms.backend.repository.MemberPermissionOverrideRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.ClubFormService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:study-club-forms-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class StudyClubFormIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String STUDY = """
            {"title":"스터디 조사","description":"","category":"STUDY","hackathonEventId":null,
             "questions":[{"id":"level","label":"수준","kind":"SINGLE","required":true,"options":["입문","심화"]}],
             "accepting":true,"closesAt":null}
            """;
    private static final String OTHER = STUDY.replace("\"STUDY\"", "\"OTHER\"");

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired MemberPermissionOverrideRepository overrides;
    @Autowired ClubFormService forms;
    @Autowired JdbcClient jdbc;
    @Autowired JwtTokenProvider tokens;

    private Cookie admin;
    private Cookie officer;
    private Cookie user;
    private Cookie associate;

    @BeforeEach
    void setup() {
        admin = add("2026000101", Member.Role.ADMIN);
        officer = add("2026000102", Member.Role.OFFICER);
        user = add("2026000103", Member.Role.USER);
        associate = add("2026000104", Member.Role.ASSOCIATE);
    }

    @Test
    void studyPermissionMatrixAndCategoryEscalation() throws Exception {
        mvc.perform(get("/api/admin/club-forms")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/club-forms").cookie(associate)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/club-forms").cookie(user)).andExpect(status().isForbidden());
        mvc.perform(json(post("/api/admin/club-forms"), STUDY).cookie(officer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.category").value("STUDY"));
        mvc.perform(json(post("/api/admin/club-forms"), OTHER).cookie(officer)).andExpect(status().isForbidden());
        ClubFormDto.Form study = forms.adminList().stream().filter(form -> form.category() == ClubFormDto.Category.STUDY).findFirst().orElseThrow();
        ClubFormDto.Form other = forms.save(null, write(ClubFormDto.Category.OTHER));
        mvc.perform(get("/api/admin/club-forms").cookie(officer))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].category").value("STUDY"))
                .andExpect(jsonPath("$[1]").doesNotExist());
        mvc.perform(get("/api/admin/club-forms").cookie(admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].category").value("OTHER"));
        String studyUpdate = STUDY.replace("\"closesAt\":null", "\"closesAt\":null,\"version\":" + study.version());
        String otherUpdate = OTHER.replace("\"closesAt\":null", "\"closesAt\":null,\"version\":" + other.version());
        mvc.perform(json(put("/api/admin/club-forms/{id}", study.id()), otherUpdate).cookie(officer)).andExpect(status().isForbidden());
        mvc.perform(json(put("/api/admin/club-forms/{id}", other.id()), studyUpdate).cookie(officer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/club-forms/{id}/responses", other.id()).cookie(officer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/club-forms/{id}/aggregates", other.id()).cookie(officer)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/club-forms/{id}", other.id()).cookie(officer).header("Origin", ORIGIN)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/club-forms/{id}/aggregates", study.id()).cookie(officer)).andExpect(status().isOk());

        overrides.saveAndFlush(new MemberPermissionOverride("2026000103", Permission.ACTIVITY_WRITE,
                MemberPermissionOverride.Effect.GRANT, "2026000101"));
        mvc.perform(get("/api/admin/club-forms").cookie(user)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].category").value("STUDY"));
        overrides.saveAndFlush(new MemberPermissionOverride("2026000102", Permission.ACTIVITY_WRITE,
                MemberPermissionOverride.Effect.REVOKE, "2026000101"));
        mvc.perform(get("/api/admin/club-forms").cookie(officer)).andExpect(status().isForbidden());
    }

    @Test
    void aggregatesUseEveryResponseBeyondFirstPage() throws Exception {
        var form = forms.save(null, write(ClubFormDto.Category.STUDY));
        for (int index = 0; index < 51; index++) {
            String studentId = String.format("202690%04d", index);
            Member responder = members.save(member(studentId, Member.Role.USER));
            jdbc.sql("""
                    INSERT INTO club_form_responses (form_id, member_id, answers_json, submitted_at)
                    VALUES (:form, :member, :answers, :time)
                    """).param("form", form.id()).param("member", responder.getId())
                    .param("answers", "{\"level\":[\"입문\"],\"slots\":[\"화요일\",\"목요일\"],\"note\":[\"참여 희망\"]}")
                    .param("time", OffsetDateTime.now()).update();
        }
        mvc.perform(get("/api/admin/club-forms/{id}/responses", form.id()).cookie(officer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(50));
        mvc.perform(get("/api/admin/club-forms/{id}/aggregates", form.id()).cookie(officer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(51))
                .andExpect(jsonPath("$.questions[0].counts['입문']").value(51))
                .andExpect(jsonPath("$.questions[0].counts['심화']").value(0))
                .andExpect(jsonPath("$.questions[1].counts['화요일']").value(51))
                .andExpect(jsonPath("$.questions[1].counts['목요일']").value(51))
                .andExpect(jsonPath("$.questions[2].answers.length()").value(51))
                .andExpect(jsonPath("$.questions[2].answers[0].value").value("참여 희망"));
        assertThat(forms.aggregates(form.id()).total()).isEqualTo(51);
    }

    private ClubFormDto.Write write(ClubFormDto.Category category) {
        return new ClubFormDto.Write("스터디 조사", "", category, null,
                List.of(new ClubFormDto.Question("level", "수준", ClubFormDto.Kind.SINGLE, true, List.of("입문", "심화")),
                        new ClubFormDto.Question("slots", "시간", ClubFormDto.Kind.MULTIPLE, false, List.of("화요일", "목요일")),
                        new ClubFormDto.Question("note", "메모", ClubFormDto.Kind.SHORT, false, List.of())),
                true, null, null);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder json(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body) {
        return request.header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private Cookie add(String id, Member.Role role) {
        members.save(member(id, role));
        return new Cookie("token", tokens.generateToken(id, 0));
    }

    private Member member(String id, Member.Role role) {
        Member member = new Member();
        member.setStudentId(id);
        member.setName(id);
        member.setEmail(id + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
