package com.coms.backend.controller;

import com.coms.backend.domain.*;
import com.coms.backend.repository.*;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:study-attendance-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/study-attendance"
})
@AutoConfigureMockMvc
@Transactional
class StudyAttendanceIntegrationTest {
    private static final String LEADER = "study-leader";
    private static final String APPROVED = "study-approved";
    private static final String PENDING = "study-pending";
    private static final String OUTSIDER = "study-outsider";
    private static final String OFFICER = "study-officer";
    private static final String ADMIN = "study-admin";
    private static final String ORIGIN = "https://coms.kw.ac.kr";

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired StudyGroupRepository groups;
    @Autowired StudyGroupMemberRepository memberships;
    @Autowired StudySessionRepository rounds;
    @Autowired AttendanceSessionRepository attendanceSessions;
    @Autowired AttendanceRecordRepository attendanceRecords;
    @Autowired NotificationRepository notifications;
    @Autowired JwtTokenProvider tokens;
    private final ObjectMapper mapper = new ObjectMapper();
    private Long groupId;

    @BeforeEach void setup() {
        members.save(member(LEADER, Member.Role.USER));
        members.save(member(APPROVED, Member.Role.USER));
        members.save(member(PENDING, Member.Role.USER));
        members.save(member(OUTSIDER, Member.Role.USER));
        members.save(member(OFFICER, Member.Role.OFFICER));
        members.save(member(ADMIN, Member.Role.ADMIN));
        StudyGroup group = new StudyGroup();
        group.setName("자료구조");
        group.setTerm("2026 2학기");
        group.setLeaderStudentId(LEADER);
        group.setCreatedBy(LEADER);
        group.setStatus(StudyGroup.Status.ACTIVE);
        groupId = groups.saveAndFlush(group).getId();
        membership(LEADER, StudyGroupMember.Role.LEADER, StudyGroupMember.Status.APPROVED);
        membership(APPROVED, StudyGroupMember.Role.MEMBER, StudyGroupMember.Status.APPROVED);
        membership(PENDING, StudyGroupMember.Role.MEMBER, StudyGroupMember.Status.PENDING);
    }

    @Test void onlyManagersCanCreateOrOpenRoundsAndOnlyParticipantsCanSeeThem() throws Exception {
        String path = path();
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(post(path).cookie(cookie(OUTSIDER)).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content(roundBody())).andExpect(status().isForbidden());
        mvc.perform(post(path).cookie(cookie(APPROVED)).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content(roundBody())).andExpect(status().isForbidden());
        long id = createRound(LEADER);
        mvc.perform(get(path).cookie(cookie(APPROVED))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].roundNo").value(1));
        mvc.perform(get(path).cookie(cookie(PENDING))).andExpect(status().isForbidden());
        mvc.perform(get(path).cookie(cookie(OUTSIDER))).andExpect(status().isForbidden());
        mvc.perform(post(path + "/" + id + "/attendance/open").cookie(cookie(PENDING)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":30}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(path + "/" + id + "/attendance/open").cookie(cookie(OFFICER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":30}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.attendanceCode").isString());
        mvc.perform(get("/api/study-groups/" + groupId + "/attendance/rates").cookie(cookie(ADMIN))).andExpect(status().isOk());
        mvc.perform(get("/api/study-groups/" + groupId + "/attendance/rates").cookie(cookie(APPROVED))).andExpect(status().isForbidden());
    }

    @Test void studyCodeRejectsPendingAndOutsidersAndManualAbsentCanBeCorrectedByCode() throws Exception {
        long id = createRound(LEADER);
        String code = open(id);
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(PENDING)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(OFFICER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(OUTSIDER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(path() + "/" + id + "/attendance/members/" + APPROVED).cookie(cookie(LEADER))
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ABSENT\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(APPROVED)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.alreadyChecked").value(false));
        AttendanceSession linked = attendanceSessions.findByStudySessionId(id).orElseThrow();
        AttendanceRecord record = attendanceRecords.findBySessionIdAndStudentId(linked.getId(), APPROVED).orElseThrow();
        assertThat(record.getStatus()).isEqualTo(AttendanceRecord.Status.PRESENT);
        assertThat(record.getSource()).isEqualTo(AttendanceRecord.Source.CODE);
        mvc.perform(get("/api/study-groups/" + groupId + "/attendance/rates").cookie(cookie(LEADER)))
                .andExpect(status().isOk());
    }

    @Test void genericAttendanceCannotRevealOrDeleteStudyRound() throws Exception {
        long id = createRound(LEADER);
        open(id);
        long attendanceId = attendanceSessions.findByStudySessionId(id).orElseThrow().getId();
        mvc.perform(get("/api/attendance/sessions").cookie(cookie(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/attendance/summary").cookie(cookie(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sessions.length()").value(0));
        mvc.perform(get("/api/attendance/sessions/" + attendanceId).cookie(cookie(ADMIN)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/attendance/sessions/" + attendanceId).cookie(cookie(ADMIN)).header("Origin", ORIGIN))
                .andExpect(status().isNotFound());
        assertThat(attendanceSessions.existsById(attendanceId)).isTrue();
    }

    @Test void formerAttendeeRemainsOnHistoricRosterWithoutRetainingAccess() throws Exception {
        long id = createRound(LEADER);
        String code = open(id);
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(APPROVED)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk());
        memberships.deleteByGroupIdAndStudentId(groupId, APPROVED);
        memberships.flush();
        mvc.perform(get(path() + "/" + id + "/attendance/roster").cookie(cookie(LEADER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.studentId == 'study-approved')].status")
                        .value(org.hamcrest.Matchers.hasItem("PRESENT")));
        mvc.perform(get(path() + "/" + id + "/attendance/roster").cookie(cookie(APPROVED)))
                .andExpect(status().isForbidden());
    }

    @Test void longGroupNameKeepsRoundSuffixWithinAttendanceTitleLimit() throws Exception {
        StudyGroup group = groups.findById(groupId).orElseThrow();
        group.setName("가".repeat(120));
        groups.saveAndFlush(group);
        long id = createRound(LEADER);
        open(id);
        String title = attendanceSessions.findByStudySessionId(id).orElseThrow().getTitle();
        assertThat(title).hasSize(100).endsWith(" 1회");
    }

    @Test void manualLateCountsAsAttendedAndCsvIsManagerOnly() throws Exception {
        long id = createRound(LEADER);
        open(id);
        mvc.perform(put(path() + "/" + id + "/attendance/members/" + APPROVED).cookie(cookie(LEADER))
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"LATE\"}"))
                .andExpect(status().isOk());
        AttendanceSession linked = attendanceSessions.findByStudySessionId(id).orElseThrow();
        AttendanceRecord record = attendanceRecords.findBySessionIdAndStudentId(linked.getId(), APPROVED).orElseThrow();
        assertThat(record.getStatus()).isEqualTo(AttendanceRecord.Status.LATE);
        assertThat(record.getSource()).isEqualTo(AttendanceRecord.Source.MANUAL);
        MvcResult csv = mvc.perform(get("/api/study-groups/" + groupId + "/attendance/rates.csv").cookie(cookie(LEADER)))
                .andExpect(status().isOk()).andReturn();
        assertThat(csv.getResponse().getContentAsString()).contains(APPROVED).contains("100.0%");
        mvc.perform(get("/api/study-groups/" + groupId + "/attendance/rates.csv").cookie(cookie(APPROVED)))
                .andExpect(status().isForbidden());
    }

    @Test void manualOnlyRoundTracksAttendanceAndCanLaterOpenACode() throws Exception {
        long round = createRound(LEADER);
        mvc.perform(put(path() + "/" + round + "/attendance/members/" + APPROVED).cookie(cookie(LEADER))
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"LATE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.studentId == '" + APPROVED + "')].source").value("MANUAL"));
        var manual = attendanceSessions.findByStudySessionId(round).orElseThrow();
        assertThat(manual.getClosedAt()).isNotNull();
        var firstTrackedAt = manual.getFirstOpenedAt();
        String code = open(round);
        assertThat(attendanceSessions.findByStudySessionId(round).orElseThrow().getFirstOpenedAt()).isEqualTo(firstTrackedAt);
        assertThat(notifications.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(APPROVED))
                .anyMatch(n -> n.getType() == Notification.Type.STUDY_ACTIVITY);
        assertThat(notifications.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(PENDING)).isEmpty();
        mvc.perform(post("/api/study-groups/" + groupId + "/end").cookie(cookie(ADMIN)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/attendance/check-in").cookie(cookie(APPROVED)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isNotFound());
    }

    @Test void roundDetailAndAttendanceWritesRespectMembershipAndManagement() throws Exception {
        long round = createRound(LEADER);
        String detail = path() + "/" + round;
        mvc.perform(get(detail).cookie(cookie(PENDING))).andExpect(status().isForbidden());
        mvc.perform(get(detail).cookie(cookie(APPROVED))).andExpect(status().isOk());
        mvc.perform(put(detail).cookie(cookie(APPROVED)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(roundBody())).andExpect(status().isForbidden());
        mvc.perform(put(detail).cookie(cookie(OFFICER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(roundBody())).andExpect(status().isOk());
        open(round);
        mvc.perform(put(detail + "/attendance/members/" + APPROVED).cookie(cookie(APPROVED)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PRESENT\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(detail + "/attendance/members/" + PENDING).cookie(cookie(OFFICER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PRESENT\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(detail + "/attendance/close").cookie(cookie(APPROVED)).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(post(detail + "/attendance/close").cookie(cookie(OFFICER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.attendanceOpen").value(false));
    }

    private String path() { return "/api/study-groups/" + groupId + "/sessions"; }
    private String roundBody() { return "{\"date\":\"" + LocalDate.now() + "\",\"topic\":\"스택\",\"notes\":\"실습\"}"; }
    private long createRound(String actor) throws Exception {
        MvcResult result = mvc.perform(post(path()).cookie(cookie(actor)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(roundBody()))
                .andExpect(status().isCreated()).andReturn();
        return json(result).get("id").asLong();
    }
    private String open(long roundId) throws Exception {
        MvcResult result = mvc.perform(post(path() + "/" + roundId + "/attendance/open")
                .cookie(cookie(LEADER)).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"minutes\":30}"))
                .andExpect(status().isOk()).andReturn();
        return json(result).get("attendanceCode").asText();
    }
    private JsonNode json(MvcResult result) throws Exception { return mapper.readTree(result.getResponse().getContentAsString()); }
    private Cookie cookie(String studentId) { return new Cookie("token", tokens.generateToken(studentId, 0)); }
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
    private void membership(String id, StudyGroupMember.Role role, StudyGroupMember.Status status) {
        StudyGroupMember member = new StudyGroupMember();
        member.setGroupId(groupId);
        member.setStudentId(id);
        member.setRole(role);
        member.setStatus(status);
        memberships.save(member);
    }
}
