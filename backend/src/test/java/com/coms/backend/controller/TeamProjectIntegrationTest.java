package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.StorageService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:team-project-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class TeamProjectIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String ADMIN_API = "/api/admin/team-projects";
    private static final String API = "/api/team-projects";

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired StorageService storage;
    @Autowired DataSource dataSource;
    private final ObjectMapper json = new ObjectMapper();
    private Cookie admin;
    private Cookie alice;
    private Cookie bob;
    private Cookie carol;
    private Cookie outsider;

    @BeforeEach
    void reset() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        for (String stored : jdbc.queryForList("SELECT stored_name FROM team_project_submission_files", String.class)) storage.delete(stored);
        for (String table : List.of("team_project_submission_files", "team_project_submission_links", "team_project_submissions",
                "team_project_members", "team_project_teams", "team_project_milestones", "team_projects")) {
            jdbc.update("DELETE FROM " + table);
        }
        members.deleteAll();
        admin = account(Member.Role.ADMIN, "chair", "회장", "30");
        alice = account(Member.Role.USER, "alice", "앨리스", "31");
        bob = account(Member.Role.USER, "bob", "밥", "31");
        carol = account(Member.Role.USER, "carol", "캐럴", "32");
        outsider = account(Member.Role.USER, "outsider", "외부인", "33");
    }

    // ---- 권한 -----------------------------------------------------------------------------

    @Test
    void anonymousIsRejectedEverywhereAndNonAdminsCannotManage() throws Exception {
        long program = createProgram("팀프");
        mvc.perform(get(API)).andExpect(status().isUnauthorized());
        mvc.perform(get(API + "/" + program)).andExpect(status().isUnauthorized());
        mvc.perform(get(API + "/" + program + "/teams/1/submissions")).andExpect(status().isUnauthorized());
        mvc.perform(post(ADMIN_API).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"x\"}")).andExpect(status().isUnauthorized());
        for (Cookie member : new Cookie[]{alice, outsider}) {
            mvc.perform(post(ADMIN_API).cookie(member).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\":\"x\"}")).andExpect(status().isForbidden());
            mvc.perform(get(ADMIN_API + "/" + program + "/board").cookie(member)).andExpect(status().isForbidden());
            mvc.perform(post(ADMIN_API + "/" + program + "/milestones").cookie(member).header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}")).andExpect(status().isForbidden());
            mvc.perform(post(ADMIN_API + "/" + program + "/teams").cookie(member).header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}")).andExpect(status().isForbidden());
        }
    }

    @Test
    void permissionMatrixForReadingSubmittingAndDownloading() throws Exception {
        Fixture f = fixture();
        long fileId = submitWithFile(alice, f, f.teamA, f.proposal, "계획", "report.pdf", "application/pdf", "%PDF-1.4 hello").path("files").get(0).path("id").asLong();
        String file = API + "/" + f.program + "/teams/" + f.teamA + "/milestones/" + f.proposal + "/submission/files/" + fileId;
        String list = API + "/" + f.program + "/teams/" + f.teamA + "/submissions";

        // 팀원: 읽기·제출·다운로드 가능
        mvc.perform(get(list).cookie(alice)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(file).cookie(bob)).andExpect(status().isOk());
        // 같은 프로그램의 다른 팀원과 회원이 아닌 사람은 읽기·내려받기·제출 모두 403
        for (Cookie stranger : new Cookie[]{carol, outsider}) {
            mvc.perform(get(list).cookie(stranger)).andExpect(status().isForbidden());
            mvc.perform(get(file).cookie(stranger)).andExpect(status().isForbidden());
            submitRaw(stranger, f.program, f.teamA, f.proposal, "침입", List.of()).andExpect(status().isForbidden());
        }
        // 회장은 팀원이 아니어도 읽기·다운로드 가능, 제출은 팀원만
        mvc.perform(get(list).cookie(admin)).andExpect(status().isOk());
        mvc.perform(get(file).cookie(admin)).andExpect(status().isOk());
        submitRaw(admin, f.program, f.teamA, f.proposal, "대리 제출", List.of()).andExpect(status().isForbidden());
        // 익명
        mvc.perform(get(file)).andExpect(status().isUnauthorized());
        submitRaw(null, f.program, f.teamA, f.proposal, "익명", List.of()).andExpect(status().isUnauthorized());
        // 회원이면 누구나 일정·팀 목록은 보되 학번은 보지 못한다. 회장은 학번을 본다.
        mvc.perform(get(API + "/" + f.program).cookie(outsider)).andExpect(status().isOk())
                .andExpect(jsonPath("$.teams.length()").value(2))
                .andExpect(jsonPath("$.teams[0].members[0].name").value("앨리스"))
                .andExpect(jsonPath("$.teams[0].members[0].studentId").doesNotExist())
                .andExpect(jsonPath("$.myTeamId").doesNotExist());
        mvc.perform(get(API + "/" + f.program).cookie(alice)).andExpect(jsonPath("$.myTeamId").value(f.teamA));
        mvc.perform(get(API + "/" + f.program).cookie(admin)).andExpect(jsonPath("$.teams[0].members[0].studentId").value("alice"));
        mvc.perform(get(API).cookie(alice)).andExpect(jsonPath("$[0].myTeamName").value("A팀"));
        mvc.perform(get(API).cookie(outsider)).andExpect(jsonPath("$[0].myTeamId").doesNotExist());
    }

    // ---- 팀·팀원 ---------------------------------------------------------------------------

    @Test
    void aMemberJoinsAtMostOneTeamPerProgramAndMustBeARealMember() throws Exception {
        Fixture f = fixture();
        addMember(f.program, f.teamB, "alice").andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 이 프로그램의 팀에 속한 회원입니다."));
        addMember(f.program, f.teamA, "alice").andExpect(status().isConflict());
        addMember(f.program, f.teamB, "ghost").andExpect(status().isNotFound());
        // 다른 프로그램에서는 다른 팀에 들어갈 수 있다.
        long other = createProgram("다른 시즌");
        long otherTeam = createTeam(other, "Z팀");
        addMember(other, otherTeam, "alice").andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("앨리스"));
        // 빼면 다시 다른 팀에 넣을 수 있다.
        mvc.perform(delete(ADMIN_API + "/" + f.program + "/teams/" + f.teamA + "/members/alice").cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        addMember(f.program, f.teamB, "alice").andExpect(status().isCreated());
        // 같은 이름의 팀은 만들 수 없다(대소문자 무시).
        mvc.perform(post(ADMIN_API + "/" + f.program + "/teams").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"b팀\"}")).andExpect(status().isConflict());
        mvc.perform(put(ADMIN_API + "/" + f.program + "/teams/" + f.teamB).cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"B팀 개명\",\"topic\":\"새 주제\",\"intro\":\"소개\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("B팀 개명"));
    }

    // ---- 제출 ------------------------------------------------------------------------------

    @Test
    void anyFileTypeIsAcceptedAndServedOnlyAsAnAttachment() throws Exception {
        Fixture f = fixture();
        String hostile = "../../<script>alert(1)</script>\"\r\nx.html";
        MockMultipartFile html = new MockMultipartFile("files", hostile, "text/html", "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8));
        MockMultipartFile svg = new MockMultipartFile("files", "logo.svg", "image/svg+xml", "<svg onload=alert(1)/>".getBytes(StandardCharsets.UTF_8));
        MockMultipartFile exe = new MockMultipartFile("files", "setup.exe", "application/x-msdownload", new byte[]{'M', 'Z', 1, 2});
        MockMultipartFile bare = new MockMultipartFile("files", "Makefile", "application/octet-stream", "all:".getBytes(StandardCharsets.UTF_8));
        MockMultipartFile unusual = new MockMultipartFile("files", "demo.mp4.zzz", "application/x-never-heard-of", "x".getBytes(StandardCharsets.UTF_8));
        JsonNode saved = json(submitRaw(alice, f.program, f.teamA, f.final_, "최종본", List.of(html, svg, exe, bare, unusual),
                "https://github.com/coms/app", "https://example.com/demo").andExpect(status().isOk())
                .andExpect(jsonPath("$.files.length()").value(5)).andExpect(jsonPath("$.links.length()").value(2))
                .andExpect(jsonPath("$.submittedByName").value("앨리스")));
        assertThat(saved.path("files")).extracting(node -> node.path("originalName").asText()).noneMatch(name -> name.contains("/") || name.contains("\n") || name.contains("\""));

        for (JsonNode file : saved.path("files")) {
            mvc.perform(get(file.path("downloadUrl").asText()).cookie(bob)).andExpect(status().isOk())
                    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                    .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")))
                    .andExpect(header().string("Content-Type", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsStringIgnoringCase("html"))))
                    .andExpect(header().string("Content-Type", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsStringIgnoringCase("svg"))));
        }
        mvc.perform(get(saved.path("files").get(0).path("downloadUrl").asText()).cookie(alice))
                .andExpect(content().string("<script>alert(1)</script>"))
                .andExpect(header().string("Content-Type", "application/octet-stream"));
        // 저장 경로에 클라이언트 파일명이 들어가지 않는다.
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(jdbc.queryForList("SELECT stored_name FROM team_project_submission_files", String.class))
                .hasSize(5).allMatch(name -> name.matches("[0-9a-f\\-]{36}\\.bin"));
    }

    @Test
    void membersEditReplaceAndRemoveWithoutLosingTheirSubmissionIdentity() throws Exception {
        Fixture f = fixture();
        JsonNode first = json(submitRaw(alice, f.program, f.teamA, f.proposal, "초안", List.of(
                new MockMultipartFile("files", "a.txt", "text/plain", "a".getBytes()),
                new MockMultipartFile("files", "b.txt", "text/plain", "b".getBytes())), "https://a.example").andExpect(status().isOk()));
        long keep = first.path("files").get(0).path("id").asLong();
        long drop = first.path("files").get(1).path("id").asLong();
        Thread.sleep(15);
        // 다른 팀원이 본문·링크를 바꾸고 파일 하나를 빼고 하나를 더한다.
        MockMultipartHttpServletRequestBuilder edit = multipartPut(bob, f.program, f.teamA, f.proposal)
                .file(new MockMultipartFile("files", "c.txt", "text/plain", "c".getBytes()))
                .param("body", "수정본").param("links", "https://b.example", "https://c.example").param("removeFileIds", String.valueOf(drop));
        JsonNode edited = json(mvc.perform(edit).andExpect(status().isOk()).andExpect(jsonPath("$.body").value("수정본"))
                .andExpect(jsonPath("$.links.length()").value(2)).andExpect(jsonPath("$.files.length()").value(2))
                .andExpect(jsonPath("$.submittedByName").value("앨리스")).andExpect(jsonPath("$.updatedByName").value("밥")));
        assertThat(edited.path("id").asLong()).isEqualTo(first.path("id").asLong());
        assertThat(edited.path("files").get(0).path("id").asLong()).isEqualTo(keep);
        assertThat(edited.path("submittedAt").asText()).isEqualTo(first.path("submittedAt").asText());
        assertThat(edited.path("updatedAt").asText()).isNotEqualTo(first.path("updatedAt").asText());
        // 빠진 파일은 더 이상 받을 수 없고 저장소에서도 지워진다.
        mvc.perform(get(API + "/" + f.program + "/teams/" + f.teamA + "/milestones/" + f.proposal + "/submission/files/" + drop).cookie(alice))
                .andExpect(status().isNotFound());
        assertThat(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM team_project_submission_files", Integer.class)).isEqualTo(2);
        // 남의 제출 파일 번호로 지우려 하면 거절.
        multipartPutRun(alice, f.program, f.teamA, f.proposal, "x", "removeFileIds", "999999").andExpect(status().isBadRequest());
        // 모두 비우면 거절, 제출 삭제는 가능.
        mvc.perform(multipartPut(alice, f.program, f.teamA, f.proposal).param("body", "")
                .param("removeFileIds", String.valueOf(keep), String.valueOf(edited.path("files").get(1).path("id").asLong()))).andExpect(status().isBadRequest());
        mvc.perform(delete(API + "/" + f.program + "/teams/" + f.teamA + "/milestones/" + f.proposal + "/submission")
                .cookie(alice).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        assertThat(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM team_project_submission_files", Integer.class)).isZero();
        mvc.perform(get(API + "/" + f.program + "/teams/" + f.teamA + "/submissions").cookie(alice)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void lateSubmissionsAreAcceptedAndFlagged() throws Exception {
        Fixture f = fixture();
        submitRaw(alice, f.program, f.teamA, f.proposal, "마감 후", List.of()).andExpect(status().isOk())
                .andExpect(jsonPath("$.late").value(true)).andExpect(jsonPath("$.editedAfterDue").value(true));
        submitRaw(alice, f.program, f.teamA, f.final_, "마감 전", List.of()).andExpect(status().isOk())
                .andExpect(jsonPath("$.late").value(false));
        // 마감이 없는 일정은 늦을 수 없다.
        long open = createMilestone(f.program, "자유 제출", null, null, true);
        submitRaw(bob, f.program, f.teamB, open, "아무 때나", List.of()).andExpect(status().isForbidden());
        submitRaw(carol, f.program, f.teamB, open, "아무 때나", List.of()).andExpect(status().isOk()).andExpect(jsonPath("$.late").value(false));

        JsonNode board = json(mvc.perform(get(ADMIN_API + "/" + f.program + "/board").cookie(admin)).andExpect(status().isOk()));
        assertThat(board.path("milestones")).hasSize(3);   // 제출을 받는 일정만 열이 된다
        JsonNode teamA = board.path("teams").get(0);
        assertThat(teamA.path("name").asText()).isEqualTo("A팀");
        assertThat(teamA.path("memberCount").asInt()).isEqualTo(2);
        assertThat(teamA.path("cells").get(0).path("status").asText()).isEqualTo("LATE");
        assertThat(teamA.path("cells").get(1).path("status").asText()).isEqualTo("SUBMITTED");
        assertThat(teamA.path("cells").get(2).path("status").asText()).isEqualTo("MISSING");
        assertThat(board.path("teams").get(1).path("cells").get(0).path("status").asText()).isEqualTo("MISSING");
        assertThat(board.path("teams").get(1).path("cells").get(2).path("status").asText()).isEqualTo("SUBMITTED");
    }

    @Test
    void submissionRulesRejectBadInputClosedProgramsAndNonSubmittableMilestones() throws Exception {
        Fixture f = fixture();
        submitRaw(alice, f.program, f.teamA, f.noSubmit, "안 받는 일정", List.of()).andExpect(status().isConflict());
        submitRaw(alice, f.program, f.teamA, f.proposal, "  ", List.of()).andExpect(status().isBadRequest());
        submitRaw(alice, f.program, f.teamA, f.proposal, "링크", List.of(), "javascript:alert(1)").andExpect(status().isBadRequest());
        submitRaw(alice, f.program, f.teamA, f.proposal, "링크", List.of(), "ftp://example.com/a").andExpect(status().isBadRequest());
        submitRaw(alice, f.program, f.teamA, f.proposal, "x".repeat(20001), List.of()).andExpect(status().isBadRequest());
        submitRaw(alice, f.program, f.teamA, f.proposal, "빈 파일", List.of(new MockMultipartFile("files", "empty.txt", "text/plain", new byte[0])))
                .andExpect(status().isBadRequest());
        submitRaw(alice, f.program, f.teamA, 99999L, "없는 일정", List.of()).andExpect(status().isNotFound());
        // 링크만, 파일만으로도 제출할 수 있고 링크 개수에는 제한이 없다.
        String[] manyLinks = java.util.stream.IntStream.range(0, 30).mapToObj(i -> "https://example.com/" + i).toArray(String[]::new);
        submitRaw(alice, f.program, f.teamA, f.proposal, "", List.of(), manyLinks).andExpect(status().isOk())
                .andExpect(jsonPath("$.links.length()").value(30));
        submitRaw(bob, f.program, f.teamA, f.final_, "", List.of(new MockMultipartFile("files", "only.bin", "application/octet-stream", new byte[]{1}))).andExpect(status().isOk());
        // 닫힌 프로그램은 읽기 전용.
        mvc.perform(put(ADMIN_API + "/" + f.program).cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"팀프\",\"description\":\"설명\",\"open\":false}")).andExpect(status().isOk());
        submitRaw(alice, f.program, f.teamA, f.proposal, "닫힌 뒤", List.of()).andExpect(status().isConflict());
        mvc.perform(get(API + "/" + f.program + "/teams/" + f.teamA + "/submissions").cookie(alice)).andExpect(status().isOk());
    }

    // ---- 일정 · 삭제 -----------------------------------------------------------------------

    @Test
    void milestonesReorderAndDeletingThemRemovesTheirFiles() throws Exception {
        Fixture f = fixture();
        submitWithFile(alice, f, f.teamA, f.proposal, "계획", "plan.txt", "text/plain", "plan");
        mvc.perform(put(ADMIN_API + "/" + f.program + "/milestones/order").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + f.final_ + "," + f.noSubmit + "," + f.proposal + "]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(f.final_)).andExpect(jsonPath("$[2].id").value(f.proposal));
        mvc.perform(put(ADMIN_API + "/" + f.program + "/milestones/order").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + f.final_ + "]}")).andExpect(status().isBadRequest());
        mvc.perform(get(API + "/" + f.program).cookie(alice)).andExpect(jsonPath("$.milestones[0].id").value(f.final_));
        mvc.perform(post(ADMIN_API + "/" + f.program + "/milestones").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"역전\",\"startsAt\":\"2026-12-02T00:00:00\",\"dueAt\":\"2026-12-01T00:00:00\"}")).andExpect(status().isBadRequest());

        String stored = new JdbcTemplate(dataSource).queryForObject("SELECT stored_name FROM team_project_submission_files", String.class);
        assertThat(storage.load(stored).exists()).isTrue();
        mvc.perform(delete(ADMIN_API + "/" + f.program + "/milestones/" + f.proposal).cookie(admin).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        assertThrows(ResponseStatusException.class, () -> storage.load(stored));
        assertThat(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM team_project_submissions", Integer.class)).isZero();
    }

    @Test
    void deletingATeamOrProgramCascadesAndCleansStoredFiles() throws Exception {
        Fixture f = fixture();
        submitWithFile(alice, f, f.teamA, f.proposal, "A", "a.txt", "text/plain", "a");
        submitWithFile(carol, f, f.teamB, f.final_, "B", "b.txt", "text/plain", "b");
        List<String> stored = new JdbcTemplate(dataSource).queryForList("SELECT stored_name FROM team_project_submission_files", String.class);
        assertThat(stored).hasSize(2);
        mvc.perform(delete(ADMIN_API + "/" + f.program + "/teams/" + f.teamA).cookie(admin).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        assertThat(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM team_project_submission_files", Integer.class)).isEqualTo(1);
        mvc.perform(delete(ADMIN_API + "/" + f.program).cookie(admin).header("Origin", ORIGIN)).andExpect(status().isNoContent());
        for (String name : stored) assertThrows(ResponseStatusException.class, () -> storage.load(name));
        for (String table : List.of("team_projects", "team_project_milestones", "team_project_teams", "team_project_members",
                "team_project_submissions", "team_project_submission_links", "team_project_submission_files")) {
            assertThat(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM " + table, Integer.class)).as(table).isZero();
        }
        mvc.perform(get(API + "/" + f.program).cookie(alice)).andExpect(status().isNotFound());
    }

    // ---- 헬퍼 ------------------------------------------------------------------------------

    private record Fixture(long program, long teamA, long teamB, long proposal, long final_, long noSubmit) {}

    /** A팀(앨리스·밥)·B팀(캐럴), 마감이 지난 제출 일정(proposal), 마감 전 제출 일정(final_), 제출 없는 일정. */
    private Fixture fixture() throws Exception {
        long program = createProgram("2026 팀프");
        long teamA = createTeam(program, "A팀");
        long teamB = createTeam(program, "B팀");
        addMember(program, teamA, "alice").andExpect(status().isCreated());
        addMember(program, teamA, "bob").andExpect(status().isCreated());
        addMember(program, teamB, "carol").andExpect(status().isCreated());
        long proposal = createMilestone(program, "개발 계획서", null, LocalDateTime.now().minusHours(2), true);
        long finalMilestone = createMilestone(program, "최종 결과물", LocalDateTime.now().minusDays(1), LocalDateTime.now().plusDays(3), true);
        long noSubmit = createMilestone(program, "시험 기간", null, null, false);
        return new Fixture(program, teamA, teamB, proposal, finalMilestone, noSubmit);
    }

    private long createProgram(String title) throws Exception {
        return json(mvc.perform(post(ADMIN_API).cookie(admin).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\",\"description\":\"설명\",\"open\":true}")).andExpect(status().isCreated())).path("id").asLong();
    }

    private long createTeam(long program, String name) throws Exception {
        return json(mvc.perform(post(ADMIN_API + "/" + program + "/teams").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\",\"topic\":\"주제\"}")).andExpect(status().isCreated())).path("id").asLong();
    }

    private long createMilestone(long program, String title, LocalDateTime start, LocalDateTime due, boolean submittable) throws Exception {
        String body = "{\"title\":\"" + title + "\",\"description\":\"\",\"submittable\":" + submittable
                + (start == null ? "" : ",\"startsAt\":\"" + start + "\"") + (due == null ? "" : ",\"dueAt\":\"" + due + "\"") + "}";
        return json(mvc.perform(post(ADMIN_API + "/" + program + "/milestones").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())).path("id").asLong();
    }

    private ResultActions addMember(long program, long team, String studentId) throws Exception {
        return mvc.perform(post(ADMIN_API + "/" + program + "/teams/" + team + "/members").cookie(admin).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"" + studentId + "\"}"));
    }

    private JsonNode submitWithFile(Cookie who, Fixture f, long team, long milestone, String body, String name, String type, String content) throws Exception {
        return json(submitRaw(who, f.program, team, milestone, body,
                List.of(new MockMultipartFile("files", name, type, content.getBytes(StandardCharsets.UTF_8)))).andExpect(status().isOk()));
    }

    private ResultActions submitRaw(Cookie who, long program, long team, long milestone, String body, List<MockMultipartFile> files,
                                    String... links) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipartPut(who, program, team, milestone).param("body", body);
        files.forEach(request::file);
        if (links.length > 0) request.param("links", links);
        return mvc.perform(request);
    }

    private ResultActions multipartPutRun(Cookie who, long program, long team, long milestone, String body, String extraName, String extraValue) throws Exception {
        return mvc.perform(multipartPut(who, program, team, milestone).param("body", body).param(extraName, extraValue));
    }

    private MockMultipartHttpServletRequestBuilder multipartPut(Cookie who, long program, long team, long milestone) {
        MockMultipartHttpServletRequestBuilder request = multipart(HttpMethod.PUT,
                API + "/" + program + "/teams/" + team + "/milestones/" + milestone + "/submission");
        request.header("Origin", ORIGIN);
        if (who != null) request.cookie(who);
        return request;
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return json.readTree(actions.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private Cookie account(Member.Role role, String studentId, String name, String generation) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setGeneration(generation);
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        members.saveAndFlush(member);
        return new Cookie("token", tokens.generateToken(studentId, member.getTokenVersion()));
    }
}
