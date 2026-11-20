package com.coms.backend.controller;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.EligibleMemberRepository;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
        "spring.datasource.url=jdbc:h2:mem:club-officer-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ClubOfficerIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String API = "/api/club-officers";
    private static final String ADMIN_API = "/api/admin/club-officers";

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired EligibleMemberRepository roster;
    @Autowired JwtTokenProvider tokens;
    @Autowired DataSource dataSource;
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;
    private Cookie admin;
    private Cookie user;

    @BeforeEach
    void reset() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM club_officers");
        jdbc.update("DELETE FROM club_officer_terms");
        members.deleteAll();
        roster.deleteAll();
        admin = account(Member.Role.ADMIN, "chair");
        user = account(Member.Role.USER, "regular");
    }

    // ---- 권한 -----------------------------------------------------------------------------

    @Test
    void authMatrix() throws Exception {
        long term = createTerm(admin, "70대", 2026);
        long officer = addOfficer(admin, term, "PRESIDENT", "가나다");

        mvc.perform(get(API)).andExpect(status().isUnauthorized());
        mvc.perform(get(ADMIN_API)).andExpect(status().isUnauthorized());
        mvc.perform(get(API).cookie(user)).andExpect(status().isOk());
        mvc.perform(get(API).cookie(admin)).andExpect(status().isOk());

        List<MockHttpServletRequestBuilder> writes = List.of(
                get(ADMIN_API), post(ADMIN_API + "/terms").content("{\"label\":\"x\",\"year\":2000}"),
                put(ADMIN_API + "/terms/" + term).content("{\"label\":\"x\",\"year\":2000}"),
                delete(ADMIN_API + "/terms/" + term),
                put(ADMIN_API + "/terms/order").content("{\"ids\":[" + term + "]}"),
                post(ADMIN_API + "/terms/" + term + "/officers").content("{\"role\":\"PRESIDENT\",\"name\":\"x\"}"),
                put(ADMIN_API + "/terms/" + term + "/officers/order").content("{\"ids\":[" + officer + "]}"),
                put(ADMIN_API + "/officers/" + officer).content("{\"role\":\"PRESIDENT\",\"name\":\"x\"}"),
                delete(ADMIN_API + "/officers/" + officer),
                put(ADMIN_API + "/officers/" + officer + "/link").content("{\"eligibleMemberId\":null}"),
                post(ADMIN_API + "/import").content("{\"rows\":[]}"));
        for (MockHttpServletRequestBuilder write : writes) {
            write.contentType(MediaType.APPLICATION_JSON).header("Origin", ORIGIN);
            mvc.perform(write).andExpect(status().isUnauthorized());
        }
        for (MockHttpServletRequestBuilder write : writes) {
            write.cookie(user);
            mvc.perform(write).andExpect(status().isForbidden());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officer_terms", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officers", Integer.class)).isEqualTo(1);
    }

    // ---- 목록 순서·노출 --------------------------------------------------------------------------

    @Test
    void listIsOrderedByYearDescThenPositionDesc() throws Exception {
        long a = createTerm(admin, "초대", 1970);
        long b = createTerm(admin, "70대", 2026);
        long c = createTerm(admin, "71대", 2026);
        long d = createTerm(admin, "69대", 2025);
        JsonNode list = json(mvc.perform(get(API).cookie(user)).andExpect(status().isOk()));
        assertThat(labels(list)).containsExactly("71대", "70대", "69대", "초대");

        // 같은 해 안의 순서를 뒤집으면 목록도 뒤집힌다.
        mvc.perform(admin(put(ADMIN_API + "/terms/order"), "{\"ids\":[" + c + "," + b + "]}")).andExpect(status().isOk());
        assertThat(labels(json(mvc.perform(get(API).cookie(user)))))
                .containsExactly("70대", "71대", "69대", "초대");
        assertThat(a + d).isPositive();
    }

    @Test
    void reorderRejectsMixedYearsAndPartialYears() throws Exception {
        long a = createTerm(admin, "70대", 2026);
        long b = createTerm(admin, "71대", 2026);
        long c = createTerm(admin, "69대", 2025);
        mvc.perform(admin(put(ADMIN_API + "/terms/order"), "{\"ids\":[" + a + "," + c + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("같은 해의 임기끼리만 순서를 바꿀 수 있습니다."));
        mvc.perform(admin(put(ADMIN_API + "/terms/order"), "{\"ids\":[" + a + "]}"))
                .andExpect(status().isBadRequest());
        assertThat(b).isPositive();
    }

    @Test
    void exposesOnlyGenerationOfLinkedRosterRow() throws Exception {
        EligibleMember row = new EligibleMember();
        row.setStudentId("2099999999");
        row.setName("가나다");
        row.setGeneration("50");
        row.setPhone("010-0000-0000");
        row.setEmail("secret@example.com");
        roster.saveAndFlush(row);
        long term = createTerm(admin, "52대", 2018);
        long linked = addOfficer(admin, term, "PRESIDENT", "가나다");
        addOfficer(admin, term, "VICE_PRESIDENT", "라마바");

        mvc.perform(admin(put(ADMIN_API + "/officers/" + linked + "/link"), "{\"eligibleMemberId\":" + row.getId() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.officers[0].eligibleMemberName").value("가나다"));

        ResultActions result = mvc.perform(get(API).cookie(user)).andExpect(status().isOk());
        String body = result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode officers = json.readTree(body).get(0).get("officers");
        assertThat(officers.get(0).get("name").asText()).isEqualTo("가나다");
        assertThat(officers.get(0).get("generation").asText()).isEqualTo("50");
        assertThat(officers.get(1).get("generation").isNull()).isTrue();
        assertThat(officers.get(0).fieldNames()).toIterable().containsExactlyInAnyOrder("id", "role", "name", "generation");
        assertThat(body).doesNotContain("2099999999", "010-0000-0000", "secret@example.com", "eligibleMemberId");
    }

    // ---- 관리: 임기·임원 CRUD ---------------------------------------------------------------------

    @Test
    void termAndOfficerCrudWithKoreanValidation() throws Exception {
        long term = createTerm(admin, "52대", 2018);
        mvc.perform(admin(post(ADMIN_API + "/terms"), "{\"label\":\"52대\",\"year\":2019}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 같은 이름의 임기가 있습니다."));
        mvc.perform(admin(post(ADMIN_API + "/terms"), "{\"label\":\"  \",\"year\":2019}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("임기 이름을(를) 입력해 주세요."));
        mvc.perform(admin(post(ADMIN_API + "/terms"), "{\"label\":\"53대\",\"year\":1800}"))
                .andExpect(status().isBadRequest());
        mvc.perform(admin(put(ADMIN_API + "/terms/" + term), "{\"label\":\"52대\",\"year\":2019,\"note\":\"메모\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.year").value(2019)).andExpect(jsonPath("$.note").value("메모"));
        mvc.perform(admin(put(ADMIN_API + "/terms/99999"), "{\"label\":\"z\",\"year\":2000}")).andExpect(status().isNotFound());

        mvc.perform(admin(post(ADMIN_API + "/terms/" + term + "/officers"), "{\"role\":\"BOSS\",\"name\":\"가나다\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("직책은 회장 또는 부회장이어야 합니다."));
        long a = addOfficer(admin, term, "PRESIDENT", "가나다");
        long b = addOfficer(admin, term, "VICE_PRESIDENT", "라마바");
        mvc.perform(admin(put(ADMIN_API + "/terms/" + term + "/officers/order"), "{\"ids\":[" + b + "," + a + "]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.officers[0].name").value("라마바"));
        mvc.perform(admin(put(ADMIN_API + "/terms/" + term + "/officers/order"), "{\"ids\":[" + b + "]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(admin(put(ADMIN_API + "/officers/" + a), "{\"role\":\"VICE_PRESIDENT\",\"name\":\"사아자\"}"))
                .andExpect(status().isOk());
        mvc.perform(admin(delete(ADMIN_API + "/officers/" + b), null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.officers.length()").value(1));
        mvc.perform(admin(delete(ADMIN_API + "/officers/" + b), null)).andExpect(status().isNotFound());
        mvc.perform(admin(delete(ADMIN_API + "/terms/" + term), null)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officers", Integer.class)).isZero();
    }

    @Test
    void linkRejectsUnknownRosterRowAndRenameDropsLink() throws Exception {
        EligibleMember row = new EligibleMember();
        row.setStudentId("2099999998");
        row.setName("가나다");
        row.setGeneration("49");
        roster.saveAndFlush(row);
        long term = createTerm(admin, "50대", 2016);
        long officer = addOfficer(admin, term, "PRESIDENT", "가나다");
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer + "/link"), "{\"eligibleMemberId\":424242}"))
                .andExpect(status().isNotFound());
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer + "/link"), "{\"eligibleMemberId\":" + row.getId() + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.officers[0].generation").value("49"));
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer), "{\"role\":\"PRESIDENT\",\"name\":\"다른사람\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.officers[0].eligibleMemberId").doesNotExist());
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer + "/link"), "{\"eligibleMemberId\":" + row.getId() + "}"))
                .andExpect(status().isOk());
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer + "/link"), "{\"eligibleMemberId\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.officers[0].generation").doesNotExist());
    }

    // ---- 삭제 연쇄 ------------------------------------------------------------------------------

    @Test
    void deletingTermCascadesAndDeletingRosterRowNullsLink() throws Exception {
        EligibleMember row = new EligibleMember();
        row.setStudentId("2099999997");
        row.setName("가나다");
        row.setGeneration("48");
        roster.saveAndFlush(row);
        long term = createTerm(admin, "49대", 2015);
        long officer = addOfficer(admin, term, "PRESIDENT", "가나다");
        mvc.perform(admin(put(ADMIN_API + "/officers/" + officer + "/link"), "{\"eligibleMemberId\":" + row.getId() + "}"))
                .andExpect(status().isOk());

        roster.deleteById(row.getId());
        roster.flush();
        mvc.perform(get(API).cookie(user)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].officers[0].name").value("가나다"))
                .andExpect(jsonPath("$[0].officers[0].generation").doesNotExist());
        assertThat(jdbc.queryForObject("SELECT eligible_member_id FROM club_officers", Long.class)).isNull();

        mvc.perform(admin(delete(ADMIN_API + "/terms/" + term), null)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officers", Integer.class)).isZero();
    }

    // ---- 일괄 등록 ------------------------------------------------------------------------------

    @Test
    void importUpsertsByLabelAndIsIdempotentAndKeepsLinks() throws Exception {
        String body = "{\"rows\":["
                + "{\"label\":\"초대\",\"year\":1970,\"presidents\":[\"가나다\"],\"vices\":[]},"
                + "{\"label\":\"70대\",\"year\":2026,\"presidents\":[\"라마바\",\"사아자\"],\"vices\":[\"차카타\"]},"
                + "{\"label\":\"71대\",\"year\":2026,\"presidents\":[\"파하가\"],\"vices\":[\" \",\"나다라\",\"나다라\"]}]}";
        mvc.perform(admin(post(ADMIN_API + "/import"), body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(3)).andExpect(jsonPath("$.updated").value(0))
                .andExpect(jsonPath("$.unchanged").value(0));
        mvc.perform(admin(post(ADMIN_API + "/import"), body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(0)).andExpect(jsonPath("$.updated").value(0))
                .andExpect(jsonPath("$.unchanged").value(3));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officer_terms", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officers", Integer.class)).isEqualTo(6);

        JsonNode list = json(mvc.perform(get(API).cookie(user)));
        assertThat(labels(list)).containsExactly("71대", "70대", "초대");
        JsonNode t70 = list.get(1);
        assertThat(t70.get("officers")).extracting(o -> o.get("role").asText() + ":" + o.get("name").asText())
                .containsExactly("PRESIDENT:라마바", "PRESIDENT:사아자", "VICE_PRESIDENT:차카타");
        assertThat(list.get(0).get("officers")).hasSize(2);

        // 연결은 (직책, 이름)이 같은 임원에 그대로 남고, 사라진 이름은 지워진다.
        EligibleMember row = new EligibleMember();
        row.setStudentId("2099999996");
        row.setName("라마바");
        row.setGeneration("47");
        roster.saveAndFlush(row);
        long linked = t70.get("officers").get(0).get("id").asLong();
        mvc.perform(admin(put(ADMIN_API + "/officers/" + linked + "/link"), "{\"eligibleMemberId\":" + row.getId() + "}"))
                .andExpect(status().isOk());
        String changed = "{\"rows\":[{\"label\":\"70대\",\"year\":2026,\"presidents\":[\"라마바\"],\"vices\":[\"새사람\"]}]}";
        mvc.perform(admin(post(ADMIN_API + "/import"), changed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(1));
        JsonNode after = json(mvc.perform(get(API).cookie(user))).get(1);
        assertThat(after.get("label").asText()).isEqualTo("70대");
        assertThat(after.get("officers")).hasSize(2);
        assertThat(after.get("officers").get(0).get("generation").asText()).isEqualTo("47");
        assertThat(after.get("officers").get(0).get("id").asLong()).isEqualTo(linked);
    }

    @Test
    void importMovesYearAndOrdersSameYearTermsByTermNumber() throws Exception {
        String body = "{\"rows\":[{\"label\":\"71대\",\"year\":2026,\"presidents\":[\"가\"],\"vices\":[]},"
                + "{\"label\":\"70대\",\"year\":2026,\"presidents\":[\"나\"],\"vices\":[]}]}";
        mvc.perform(admin(post(ADMIN_API + "/import"), body)).andExpect(status().isOk());
        assertThat(labels(json(mvc.perform(get(API).cookie(user))))).containsExactly("71대", "70대");
        String moved = "{\"rows\":[{\"label\":\"71대\",\"year\":2027,\"presidents\":[\"가\"],\"vices\":[]}]}";
        mvc.perform(admin(post(ADMIN_API + "/import"), moved)).andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(1));
        assertThat(json(mvc.perform(get(API).cookie(user))).get(0).get("year").asInt()).isEqualTo(2027);
    }

    @Test
    void importIsAllOrNothingWithKoreanMessages() throws Exception {
        String bad = "{\"rows\":[{\"label\":\"70대\",\"year\":2026,\"presidents\":[\"가\"],\"vices\":[]},"
                + "{\"label\":\"71대\",\"year\":99,\"presidents\":[],\"vices\":[]}]}";
        mvc.perform(admin(post(ADMIN_API + "/import"), bad)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("2번째 줄: 연도는 1900~2100 사이여야 합니다."));
        mvc.perform(admin(post(ADMIN_API + "/import"),
                "{\"rows\":[{\"label\":\"70대\",\"year\":2026},{\"label\":\"70대\",\"year\":2026}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("2번째 줄: 임기 이름 '70대'이(가) 중복되었습니다."));
        mvc.perform(admin(post(ADMIN_API + "/import"), "{\"rows\":[]}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("등록할 임기가 없습니다."));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM club_officer_terms", Integer.class)).isZero();
    }

    // ---- helpers ---------------------------------------------------------------------------

    private List<String> labels(JsonNode list) {
        List<String> out = new ArrayList<>();
        list.forEach(t -> out.add(t.get("label").asText()));
        return out;
    }

    private long createTerm(Cookie who, String label, int year) throws Exception {
        return json(mvc.perform(admin(post(ADMIN_API + "/terms"), "{\"label\":\"" + label + "\",\"year\":" + year + "}"))
                .andExpect(status().isCreated())).get("id").asLong();
    }

    private long addOfficer(Cookie who, long term, String role, String name) throws Exception {
        JsonNode view = json(mvc.perform(admin(post(ADMIN_API + "/terms/" + term + "/officers"),
                "{\"role\":\"" + role + "\",\"name\":\"" + name + "\"}")).andExpect(status().isCreated()));
        long id = 0;
        for (JsonNode o : view.get("officers")) id = Math.max(id, o.get("id").asLong());
        return id;
    }

    private MockHttpServletRequestBuilder admin(MockHttpServletRequestBuilder request, String content) {
        request.cookie(admin).header("Origin", ORIGIN);
        if (content != null) request.contentType(MediaType.APPLICATION_JSON).content(content);
        return request;
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return json.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private Cookie account(Member.Role role, String studentId) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(studentId);
        member.setGeneration("30");
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        members.saveAndFlush(member);
        return new Cookie("token", tokens.generateToken(studentId, member.getTokenVersion()));
    }
}
