package com.coms.backend.controller;

import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.domain.HackathonMaterial;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.repository.HackathonMaterialRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "jwt.secret=club-workflow-test-key-with-enough-characters",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:club-workflow-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ClubWorkflowsIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String FORMS = "/api/club-forms";
    private static final String ADMIN_FORMS = "/api/admin/club-forms";
    @Autowired MockMvc mvc;
    @Autowired HackathonEventRepository events;
    @Autowired HackathonMaterialRepository materials;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    private final ObjectMapper json = new ObjectMapper();
    private Member admin;
    private Member author;
    private Member outsider;

    @BeforeEach
    void membersForTest() {
        admin = member("chair", Member.Role.ADMIN);
        author = member("team-author", Member.Role.USER);
        outsider = member("other-member", Member.Role.USER);
    }

    @Test
    void onlyAssignedMemberCanSaveDraftAndOnlyPublishedWorkCanBeSeenOrReviewed() throws Exception {
        long id = event(true);
        String adminEvent = "/api/admin/hackathon/events/" + id;
        String event = "/api/hackathon/events/" + id;
        String work = "/api/hackathon/team-work/" + id;
        JsonNode created = response(mvc.perform(body(post(adminEvent + "/projects"), admin, """
                {"teamName":"회로팀","published":false,"memberIds":[%d]}
                """.formatted(author.getId()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray());
        String projectId = created.get("projectId").asText();
        long draftVersion = created.get("version").asLong();
        mvc.perform(get(event)).andExpect(status().isOk()).andExpect(jsonPath("$.projects").isEmpty());
        mvc.perform(get(work)).andExpect(status().isUnauthorized());
        mvc.perform(get(work).cookie(cookie(outsider))).andExpect(status().isOk()).andExpect(jsonPath("$.projects").isEmpty());
        mvc.perform(get(adminEvent + "/projects/" + projectId + "/members").cookie(cookie(outsider))).andExpect(status().isForbidden());
        mvc.perform(get(work).cookie(cookie(author))).andExpect(status().isOk())
                .andExpect(jsonPath("$.projects[0].teamName").value("회로팀"))
                .andExpect(jsonPath("$.projects[0].memberIds").doesNotExist());

        HackathonMaterial material = new HackathonMaterial();
        material.setEventId(id);
        material.setProjectId(projectId);
        material.setKind("proposal");
        material.setOriginalName("draft.pdf");
        material.setMimeType("application/pdf");
        material.setFileSize(12L);
        material.setLegacyUrl("/hackathon-2026/wargether/proposal.pdf");
        long materialId = materials.saveAndFlush(material).getId();
        mvc.perform(get(event + "/materials/" + materialId)).andExpect(status().isNotFound());
        mvc.perform(body(put(adminEvent + "/settings"), admin, "{\"open\":true}")).andExpect(status().isConflict());

        String draftWrite = """
                {"title":"회로 작품","author":"팀 대표","description":"작품 설명","version":%d}
                """.formatted(draftVersion);
        mvc.perform(body(put(work + "/" + projectId), outsider, draftWrite)).andExpect(status().isNotFound());
        JsonNode saved = response(mvc.perform(body(put(work + "/" + projectId), author, draftWrite)).andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(false)).andReturn().getResponse().getContentAsByteArray());
        mvc.perform(body(put(work + "/" + projectId), author, draftWrite)).andExpect(status().isConflict());
        // Guest judging is off by default for an event, so a guest is turned away before the project is looked up;
        // a signed-in member still cannot review a draft.
        mvc.perform(body(post(event + "/reviews"), null, "{\"projectId\":\"" + projectId + "\"}")).andExpect(status().isUnauthorized());
        mvc.perform(body(post(event + "/reviews"), outsider, "{\"projectId\":\"" + projectId + "\"}")).andExpect(status().isNotFound());

        mvc.perform(body(put(adminEvent + "/projects/" + projectId), admin, """
                {"teamName":"회로팀","title":"회로 작품","author":"팀 대표","description":"작품 설명","published":true,"version":%d}
                """.formatted(saved.get("version").asLong()))).andExpect(status().isOk());
        mvc.perform(get(event)).andExpect(status().isOk()).andExpect(jsonPath("$.projects[0].title").value("회로 작품"))
                .andExpect(jsonPath("$.projects[0].teamName").value("회로팀")).andExpect(jsonPath("$.projects[0].memberIds").doesNotExist());
        mvc.perform(get(event + "/materials/" + materialId)).andExpect(status().isFound());
        mvc.perform(body(put(adminEvent + "/settings"), admin, "{\"open\":true}")).andExpect(status().isOk());
        mvc.perform(body(put(work + "/" + projectId), author, draftWrite)).andExpect(status().isConflict());
    }

    @Test
    void formResponsesArePrivateEditableUntilClosureAndBoundToQuestionVersion() throws Exception {
        String write = """
                {"title":"팀프 수요조사","description":"참여 의향","category":"TEAM_PROJECT","accepting":true,
                 "questions":[{"id":"interest","label":"관심 분야","kind":"SINGLE","required":true,"options":["웹","회로"]}]}
                """;
        mvc.perform(get(FORMS)).andExpect(status().isUnauthorized());
        mvc.perform(body(post(ADMIN_FORMS), author, write)).andExpect(status().isForbidden());
        JsonNode created = response(mvc.perform(body(post(ADMIN_FORMS), admin, write)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray());
        String publicForm = FORMS + "/" + created.get("id").asLong();
        String adminForm = ADMIN_FORMS + "/" + created.get("id").asLong();
        var submit = publicForm + "/response";
        mvc.perform(body(put(submit), author, "{\"formVersion\":0,\"answers\":{\"interest\":[\"없는 보기\"]}}")).andExpect(status().isBadRequest());
        mvc.perform(body(put(submit), author, "{\"formVersion\":9,\"answers\":{\"interest\":[\"웹\"]}}")).andExpect(status().isConflict());
        mvc.perform(body(put(submit), author, "{\"formVersion\":0,\"answers\":{\"interest\":[\"웹\"]}}")).andExpect(status().isOk());
        mvc.perform(body(put(submit), author, "{\"formVersion\":0,\"answers\":{\"interest\":[\"회로\"]}}")).andExpect(status().isOk());
        mvc.perform(get(publicForm).cookie(cookie(outsider))).andExpect(status().isOk()).andExpect(jsonPath("$.response").doesNotExist());
        mvc.perform(get(adminForm + "/responses").cookie(cookie(author))).andExpect(status().isForbidden());
        mvc.perform(get(adminForm + "/responses").cookie(cookie(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].answers.interest[0]").value("회로"));
        mvc.perform(body(put(adminForm), admin, write.replace("관심 분야", "바뀐 질문").replace("\"accepting\":true", "\"accepting\":true,\"version\":0")))
                .andExpect(status().isConflict());
        mvc.perform(body(put(adminForm), admin, write.replace("\"accepting\":true", "\"accepting\":false,\"version\":0")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").value(false));
        mvc.perform(get(publicForm).cookie(cookie(outsider))).andExpect(status().isNotFound());
        mvc.perform(get(publicForm).cookie(cookie(author))).andExpect(status().isOk())
                .andExpect(jsonPath("$.response.answers.interest[0]").value("회로"));
        mvc.perform(body(put(submit), author, "{\"formVersion\":1,\"answers\":{\"interest\":[\"웹\"]}}")).andExpect(status().isConflict());
        mvc.perform(body(delete(adminForm), admin, "")).andExpect(status().isConflict());
    }

    @Test
    void futureAndPastDeadlinesAndPrivateEventsControlFormAvailability() throws Exception {
        String write = """
                {"title":"해커톤 신청","category":"HACKATHON","hackathonEventId":%d,"accepting":true,
                 "closesAt":"%s","questions":[{"id":"team","label":"팀 이름","kind":"SHORT","required":true}]}
                """;
        long hiddenEvent = event(false);
        long visibleEvent = event(true);
        for (String payload : new String[] { write.formatted(hiddenEvent, "2199-01-01T12:00"),
                write.formatted(visibleEvent, "2000-01-01T12:00") }) {
            JsonNode created = response(mvc.perform(body(post(ADMIN_FORMS), admin, payload)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.open").value(false)).andReturn().getResponse().getContentAsByteArray());
            String form = FORMS + "/" + created.get("id").asLong();
            mvc.perform(get(form).cookie(cookie(author))).andExpect(status().isNotFound());
            mvc.perform(body(put(form + "/response"), author, "{\"formVersion\":0,\"answers\":{\"team\":[\"팀\"]}}"))
                    .andExpect(status().isNotFound());
        }
    }

    private long event(boolean published) {
        HackathonEvent event = new HackathonEvent();
        event.setTitle("테스트 해커톤");
        event.setYear(2026);
        event.setSemester(2);
        event.setPublished(published);
        return events.saveAndFlush(event).getId();
    }

    private Member member(String name, Member.Role role) {
        return members.findByStudentId(name).orElseGet(() -> {
            Member member = new Member();
            member.setStudentId(name);
            member.setName(name);
            member.setEmail(name + "@example.com");
            member.setPassword("unused");
            member.setRole(role);
            member.setEmailVerified(true);
            return members.saveAndFlush(member);
        });
    }

    private Cookie cookie(Member member) {
        return new Cookie("token", tokens.generateToken(member.getStudentId(), member.getTokenVersion()));
    }

    private MockHttpServletRequestBuilder body(MockHttpServletRequestBuilder request, Member member, String payload) {
        request.header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(payload);
        return member == null ? request : request.cookie(cookie(member));
    }

    private JsonNode response(byte[] body) throws Exception { return json.readTree(body); }
}
