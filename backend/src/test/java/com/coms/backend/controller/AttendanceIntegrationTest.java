package com.coms.backend.controller;

import com.coms.backend.domain.AttendanceSession;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.AttendanceRecordRepository;
import com.coms.backend.repository.AttendanceSessionRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.AttendanceService;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Attendance end to end through the real filter chain: who may open a check and see who
 * attended, checking in with the code, what a member is and is not shown, the end of a
 * session, the limit on wrong codes, and what goes with a removed account.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:attendance-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/attendance"
})
@AutoConfigureMockMvc
@Transactional
class AttendanceIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String PRESIDENT = "2026000031";
    private static final String MEMBER = "2026000032";
    private static final String OTHER = "2026000033";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private AttendanceSessionRepository sessionRepository;
    @Autowired
    private AttendanceRecordRepository recordRepository;
    @Autowired
    private AttendanceService attendanceService;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private Cookie presidentCookie;
    private Cookie memberCookie;
    private Cookie otherCookie;

    @BeforeEach
    void setUp() {
        recordRepository.deleteAll();
        sessionRepository.deleteAll();
        memberRepository.deleteAll();
        memberRepository.save(member(PRESIDENT, "회장", Member.Role.ADMIN));
        memberRepository.save(member(MEMBER, "부원", Member.Role.USER));
        memberRepository.save(member(OTHER, "다른부원", Member.Role.ASSOCIATE));
        presidentCookie = authCookie(PRESIDENT);
        memberCookie = authCookie(MEMBER);
        otherCookie = authCookie(OTHER);
    }

    @Test
    void loggedOutVisitorsAreRefused() throws Exception {
        mockMvc.perform(get("/api/attendance/sessions")).andExpect(status().isUnauthorized());
        checkIn(null, "1234").andExpect(status().isUnauthorized());
    }

    @Test
    void onlyThoseWhoRunActivitiesMayOpenCloseAndSeeWhoAttended() throws Exception {
        open(memberCookie, "세미나", 30).andExpect(status().isForbidden());
        long id = openAndGetId("세미나", 30);
        mockMvc.perform(get("/api/attendance/sessions/{id}", id).cookie(memberCookie)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/attendance/sessions/{id}/close", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/attendance/sessions/{id}", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/attendance/summary").cookie(memberCookie)).andExpect(status().isForbidden());
        assertThat(sessionRepository.existsById(id)).isTrue();
    }

    @Test
    void theSummaryCountsAttendancePerMemberWithoutStudentIds() throws Exception {
        mockMvc.perform(get("/api/attendance/summary").cookie(presidentCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessions.length()").value(0))
                .andExpect(jsonPath("$.members.length()").value(0));

        // Two members share a name: they stay two rows.
        String namesake = "2026000034";
        memberRepository.save(member(namesake, "부원", Member.Role.USER));
        JsonNode first = json(open(presidentCookie, "1주차", 30).andReturn());
        checkIn(memberCookie, first.get("code").asText()).andExpect(status().isOk());
        checkIn(otherCookie, first.get("code").asText()).andExpect(status().isOk());
        checkIn(authCookie(namesake), first.get("code").asText()).andExpect(status().isOk());
        JsonNode second = json(open(presidentCookie, "2주차", 30).andReturn());
        checkIn(memberCookie, second.get("code").asText()).andExpect(status().isOk());

        MvcResult summary = mockMvc.perform(get("/api/attendance/summary").cookie(presidentCookie))
                .andExpect(status().isOk())
                // Checks newest first, each with its head count.
                .andExpect(jsonPath("$.sessions.length()").value(2))
                .andExpect(jsonPath("$.sessions[0].title").value("2주차"))
                .andExpect(jsonPath("$.sessions[0].attendeeCount").value(1))
                .andExpect(jsonPath("$.sessions[1].title").value("1주차"))
                .andExpect(jsonPath("$.sessions[1].attendeeCount").value(3))
                // Members by how often they came, then by name.
                .andExpect(jsonPath("$.members.length()").value(3))
                .andExpect(jsonPath("$.members[0].name").value("부원"))
                .andExpect(jsonPath("$.members[0].count").value(2))
                .andExpect(jsonPath("$.members[0].sessionIds.length()").value(2))
                .andExpect(jsonPath("$.members[0].sessionIds[0]").value(first.get("id").asLong()))
                .andExpect(jsonPath("$.members[0].sessionIds[1]").value(second.get("id").asLong()))
                .andExpect(jsonPath("$.members[1].name").value("다른부원"))
                .andExpect(jsonPath("$.members[1].count").value(1))
                .andExpect(jsonPath("$.members[2].name").value("부원"))
                .andExpect(jsonPath("$.members[2].count").value(1))
                .andReturn();
        assertThat(summary.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(MEMBER).doesNotContain(OTHER).doesNotContain(namesake).doesNotContain("studentId");
    }

    @Test
    void aMemberChecksInWithTheCodeAndSeesOnlyTheirOwnAttendance() throws Exception {
        MvcResult opened = open(presidentCookie, "  웹 세미나 1주차  ", 30)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("웹 세미나 1주차"))
                .andExpect(jsonPath("$.open").value(true))
                // Thirty minutes, counted on the server.
                .andExpect(jsonPath("$.remainingSeconds").value(allOf(greaterThan(1700), lessThanOrEqualTo(1800))))
                .andExpect(jsonPath("$.attendeeCount").value(0))
                .andReturn();
        JsonNode session = json(opened);
        long id = session.get("id").asLong();
        String code = session.get("code").asText();
        assertThat(code).matches("\\d{4}");

        checkIn(memberCookie, "0000".equals(code) ? "1111" : "0000").andExpect(status().isNotFound());
        // Spaces around or inside the code are forgiven.
        checkIn(memberCookie, " " + code.substring(0, 2) + " " + code.substring(2) + " ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value(id))
                .andExpect(jsonPath("$.title").value("웹 세미나 1주차"))
                .andExpect(jsonPath("$.alreadyChecked").value(false));
        // A second check-in reports the first and adds nothing.
        checkIn(memberCookie, code).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyChecked").value(true));
        assertThat(recordRepository.count()).isEqualTo(1);

        // The member sees the head count and their own attendance, not the code.
        MvcResult memberList = mockMvc.perform(get("/api/attendance/sessions").cookie(memberCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].attended").value(true))
                .andExpect(jsonPath("$[0].attendeeCount").value(1))
                .andExpect(jsonPath("$[0].code").doesNotExist())
                .andReturn();
        assertThat(memberList.getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain(code);
        mockMvc.perform(get("/api/attendance/sessions").cookie(otherCookie))
                .andExpect(jsonPath("$[0].attended").value(false))
                .andExpect(jsonPath("$[0].attendeeCount").value(1));

        // Whoever runs it sees the code while it is open, and names only.
        mockMvc.perform(get("/api/attendance/sessions").cookie(presidentCookie))
                .andExpect(jsonPath("$[0].code").value(code));
        MvcResult detail = mockMvc.perform(get("/api/attendance/sessions/{id}", id).cookie(presidentCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attendees.length()").value(1))
                .andExpect(jsonPath("$.attendees[0].name").value("부원"))
                .andReturn();
        assertThat(detail.getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain(MEMBER).doesNotContain("studentId");
    }

    @Test
    void checkInStopsWhenTheSessionIsClosedOrRunsOut() throws Exception {
        JsonNode first = json(open(presidentCookie, "닫는 출석", 30).andReturn());
        mockMvc.perform(post("/api/attendance/sessions/{id}/close", first.get("id").asLong()).cookie(presidentCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(false))
                .andExpect(jsonPath("$.remainingSeconds").value(0))
                .andExpect(jsonPath("$.code").doesNotExist());
        checkIn(memberCookie, first.get("code").asText()).andExpect(status().isNotFound());

        JsonNode second = json(open(presidentCookie, "시간이 끝난 출석", 30).andReturn());
        AttendanceSession expired = sessionRepository.findById(second.get("id").asLong()).orElseThrow();
        expired.setClosesAt(LocalDateTime.now().minusMinutes(1));
        sessionRepository.saveAndFlush(expired);
        checkIn(otherCookie, second.get("code").asText()).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/attendance/sessions").cookie(presidentCookie))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[1].open").value(false));
        assertThat(recordRepository.count()).isZero();
    }

    @Test
    void wrongCodesAreLimitedPerMember() throws Exception {
        // The count of wrong codes is kept in memory per member for five minutes, and the
        // service is shared by every test here: these two members exist for this test alone.
        memberRepository.save(member("2026000041", "틀리는부원", Member.Role.USER));
        memberRepository.save(member("2026000042", "맞히는부원", Member.Role.USER));
        Cookie guesser = authCookie("2026000041");
        Cookie bystander = authCookie("2026000042");
        JsonNode session = json(open(presidentCookie, "세미나", 30).andReturn());
        String code = session.get("code").asText();
        String wrong = "0000".equals(code) ? "1111" : "0000";
        for (int i = 0; i < 10; i++) checkIn(guesser, wrong).andExpect(status().isNotFound());
        // After ten wrong tries even the right code is refused for a while...
        checkIn(guesser, code).andExpect(status().isTooManyRequests());
        // ...but only for that member.
        checkIn(bystander, code).andExpect(status().isOk());
    }

    @Test
    void aSessionThatBreaksTheRulesIsRefused() throws Exception {
        open(presidentCookie, "   ", 30).andExpect(status().isBadRequest());
        open(presidentCookie, "세미나", 4).andExpect(status().isBadRequest());
        open(presidentCookie, "세미나", 181).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/attendance/sessions")
                        .cookie(presidentCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"세미나\"}"))
                .andExpect(status().isBadRequest());
        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void deletingASessionRemovesItsRecords() throws Exception {
        JsonNode session = json(open(presidentCookie, "세미나", 30).andReturn());
        checkIn(memberCookie, session.get("code").asText()).andExpect(status().isOk());
        mockMvc.perform(delete("/api/attendance/sessions/{id}", session.get("id").asLong()).cookie(presidentCookie).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        assertThat(sessionRepository.count()).isZero();
        assertThat(recordRepository.count()).isZero();
    }

    @Test
    void aRemovedAccountsCheckInsGoAndTheSessionsItOpenedStayWithoutItsName() throws Exception {
        JsonNode session = json(open(presidentCookie, "세미나", 30).andReturn());
        String code = session.get("code").asText();
        checkIn(memberCookie, code).andExpect(status().isOk());
        checkIn(otherCookie, code).andExpect(status().isOk());

        attendanceService.deleteDataForMember(MEMBER);
        assertThat(recordRepository.findBySessionIdOrderByCheckedAtAscIdAsc(session.get("id").asLong()))
                .extracting(record -> record.getStudentId())
                .containsExactly(OTHER);

        attendanceService.deleteDataForMember(PRESIDENT);
        AttendanceSession kept = sessionRepository.findById(session.get("id").asLong()).orElseThrow();
        assertThat(kept.getOpenedByStudentId()).isNotEqualTo(PRESIDENT);
        assertThat(kept.getOpenedByName()).isEqualTo("탈퇴한 회원");
        assertThat(recordRepository.count()).isEqualTo(1);
    }

    private ResultActions open(Cookie cookie, String title, int minutes) throws Exception {
        return mockMvc.perform(post("/api/attendance/sessions")
                .cookie(cookie)
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\",\"minutes\":" + minutes + "}"));
    }

    private long openAndGetId(String title, int minutes) throws Exception {
        return json(open(presidentCookie, title, minutes).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private ResultActions checkIn(Cookie cookie, String code) throws Exception {
        var request = post("/api/attendance/check-in")
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + code + "\"}");
        return mockMvc.perform(cookie == null ? request : request.cookie(cookie));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private Cookie authCookie(String studentId) {
        return new Cookie("token", jwtTokenProvider.generateToken(studentId, 0));
    }

    private Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
