package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.MemberPermissionOverride;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.Permission;
import com.coms.backend.domain.StudyGroup;
import com.coms.backend.domain.StudyGroupMember;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MemberPermissionOverrideRepository;
import com.coms.backend.repository.NotificationRepository;
import com.coms.backend.repository.StudyGroupRepository;
import com.coms.backend.repository.StudyGroupMemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.StudyGroupService;
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
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:study-groups-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/study-groups"
})
@AutoConfigureMockMvc
@Transactional
class StudyGroupIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String LEADER = "2026112401";
    private static final String MEMBER = "2026112402";
    private static final String ASSOCIATE = "2026112403";
    private static final String MANAGER = "2026112404";
    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired MemberRepository members;
    @Autowired MemberPermissionOverrideRepository overrides;
    @Autowired NotificationRepository notifications;
    @Autowired StudyGroupRepository groups;
    @Autowired StudyGroupMemberRepository memberships;
    @Autowired StudyGroupService studies;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach void setUp() {
        save(LEADER, Member.Role.USER);
        save(MEMBER, Member.Role.USER);
        save(ASSOCIATE, Member.Role.ASSOCIATE);
        save(MANAGER, Member.Role.ADMIN);
    }

    @Test void proposalAndGuestVisibilityFollowRoles() throws Exception {
        mvc.perform(post("/api/study-groups").header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(write()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/study-groups").cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(write())).andExpect(status().isForbidden());
        long id = propose();
        mvc.perform(get("/api/study-groups")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/api/study-groups/{id}", id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(LEADER)).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RECRUITING"));
        mvc.perform(get("/api/study-groups")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("자바 스터디"))
                .andExpect(jsonPath("$[0].leaderName").value(LEADER))
                .andExpect(jsonPath("$[0].leaderStudentId").doesNotExist())
                .andExpect(jsonPath("$[0].interestCount").doesNotExist())
                .andExpect(jsonPath("$[0].createdBy").doesNotExist());
    }

    @Test void interestIsIdempotentAndNamesAreManagerOnly() throws Exception {
        long id = propose();
        String answer = "{\"slots\":[\"TUE_EVENING\",\"TUE_EVENING\",\"FRI_MORNING\"],\"level\":\"BEGINNER\"}";
        for (int i = 0; i < 2; i++) mvc.perform(put("/api/study-groups/{id}/interest", id)
                .cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(answer)).andExpect(status().isOk());
        mvc.perform(get("/api/study-groups/{id}/interest", id).cookie(cookie(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.slots.TUE_EVENING").value(1))
                .andExpect(jsonPath("$.levels.BEGINNER").value(1))
                .andExpect(jsonPath("$.names").value(nullValue()));
        mvc.perform(get("/api/study-groups/{id}/interest", id).cookie(cookie(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.names[0].studentId").value(ASSOCIATE));
        mvc.perform(put("/api/study-groups/{id}/interest", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"slots\":[\"BAD\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test void guestInterestSortDoesNotRevealDemandOrder() throws Exception {
        long popular = propose();
        mvc.perform(put("/api/study-groups/{id}/interest", popular).cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"slots\":[]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/approve", popular).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups?direct=true").cookie(cookie(MANAGER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(write().replace("자바 스터디", "최신 스터디")))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/study-groups?sort=interest"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("최신 스터디"))
                .andExpect(jsonPath("$[0].interestCount").doesNotExist());
        mvc.perform(get("/api/study-groups?sort=interest").cookie(cookie(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("자바 스터디"))
                .andExpect(jsonPath("$[0].interestCount").value(1));
    }

    @Test void capacityAndApprovalProtectMembership() throws Exception {
        long id = propose();
        String otherApplicant = "2026112406";
        save(otherApplicant, Member.Role.USER);
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(otherApplicant)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(notifications.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(LEADER))
                .anyMatch(n -> n.getType() == Notification.Type.STUDY_ACTIVITY && MEMBER.equals(n.getActorStudentId()));
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[1].status").value("PENDING"));
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, MEMBER)
                        .cookie(cookie(LEADER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, MEMBER)
                        .cookie(cookie(LEADER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"approved\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        assertThat(notifications.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(MEMBER))
                .anyMatch(n -> n.getType() == Notification.Type.STUDY_ACTIVITY && LEADER.equals(n.getActorStudentId()));
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isConflict());
        String extra = "2026112405";
        save(extra, Member.Role.USER);
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(extra)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, extra)
                        .cookie(cookie(LEADER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"approved\":true}"))
                .andExpect(status().isConflict());
        assertThat(groups.findById(id).orElseThrow().getStatus()).isEqualTo(StudyGroup.Status.RECRUITING);
    }

    @Test void associateWithActivityPermissionCanCreateOnlyWithAnEligibleLeader() throws Exception {
        overrides.saveAndFlush(new MemberPermissionOverride(ASSOCIATE, Permission.ACTIVITY_WRITE,
                MemberPermissionOverride.Effect.GRANT, MANAGER));
        String delegated = write().replace("\"capacity\":2", "\"capacity\":2,\"leaderStudentId\":\"" + LEADER + "\"");

        mvc.perform(post("/api/study-groups").param("direct", "true").cookie(cookie(MEMBER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(delegated)).andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups").cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(delegated)).andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups").param("direct", "true").cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(write())).andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups").param("direct", "true").cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(delegated)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("RECRUITING"))
                .andExpect(jsonPath("$.leaderStudentId").value(LEADER))
                .andExpect(jsonPath("$.createdBy").value(ASSOCIATE));
    }

    @Test void managementAndMembershipActionsKeepTheirSeparateGuards() throws Exception {
        long id = propose();
        mvc.perform(put("/api/study-groups/{id}", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(write())).andExpect(status().isForbidden());
        mvc.perform(put("/api/study-groups/{id}", id).cookie(cookie(LEADER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(write())).andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/start", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups/{id}/start", id).cookie(cookie(LEADER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/study-groups/{id}/members/{studentId}", id, MEMBER)
                .cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)).andExpect(status().isForbidden());
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, MEMBER).cookie(cookie(LEADER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"approved\":false}")).andExpect(status().isNoContent());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/study-groups/{id}/members/me", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/study-groups/{id}/members/me", id).cookie(cookie(LEADER)).header("Origin", ORIGIN))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/study-groups/{id}/end", id).cookie(cookie(LEADER)).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/study-groups/{id}/end", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ENDED"));
    }

    @Test void associatesCanViewAndExpressInterestButOnlyFullMembersCanApply() throws Exception {
        long id = propose();
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(get("/api/study-groups/{id}", id).cookie(cookie(ASSOCIATE))).andExpect(status().isOk());
        mvc.perform(put("/api/study-groups/{id}/interest", id).cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"slots\":[\"MON_MORNING\"]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(ASSOCIATE)).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        assertThat(memberships.findByGroupIdAndStudentId(id, ASSOCIATE)).isEmpty();
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test void pendingApplicantCannotBeApprovedAfterDemotionAndApprovedMemberLosesRosterAccess() throws Exception {
        long id = propose();
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        Member account = members.findByStudentId(MEMBER).orElseThrow();
        account.setRole(Member.Role.ASSOCIATE);
        members.saveAndFlush(account);
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, MEMBER).cookie(cookie(LEADER))
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approved\":true}"))
                .andExpect(status().isForbidden());
        assertThat(memberships.findByGroupIdAndStudentId(id, MEMBER).orElseThrow().getStatus())
                .isEqualTo(StudyGroupMember.Status.PENDING);
        account.setRole(Member.Role.USER);
        members.saveAndFlush(account);
        mvc.perform(put("/api/study-groups/{id}/members/{studentId}", id, MEMBER).cookie(cookie(LEADER))
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approved\":true}"))
                .andExpect(status().isOk());
        account.setRole(Member.Role.ASSOCIATE);
        members.saveAndFlush(account);
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(MEMBER)))
                .andExpect(status().isForbidden());
        overrides.saveAndFlush(new MemberPermissionOverride(MEMBER, Permission.ACTIVITY_WRITE,
                MemberPermissionOverride.Effect.GRANT, MANAGER));
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(MEMBER)))
                .andExpect(status().isForbidden());
        assertThat(memberships.findByGroupIdAndStudentId(id, MEMBER).orElseThrow().getStatus())
                .isEqualTo(StudyGroupMember.Status.APPROVED);
    }

    @Test void deletedLeaderLosesMembershipAndGroupIsEnded() throws Exception {
        long id = propose();
        save("removed", Member.Role.USER);
        studies.deleteDataForMember(LEADER);
        StudyGroup group = groups.findById(id).orElseThrow();
        assertThat(group.getLeaderStudentId()).isNull();
        assertThat(group.getStatus()).isEqualTo(StudyGroup.Status.ENDED);
        assertThat(memberships.findByGroupIdAndStudentId(id, LEADER)).isEmpty();
        mvc.perform(get("/api/study-groups/{id}/members", id).cookie(cookie(LEADER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/study-groups/{id}", id).cookie(cookie("removed")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.leaderStudentId").value(nullValue()))
                .andExpect(jsonPath("$.leaderName").value("리더 없음")).andExpect(jsonPath("$.manager").value(false));
        mvc.perform(get("/api/study-groups").cookie(cookie(MANAGER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].leaderName").value("리더 없음"));
        mvc.perform(put("/api/study-groups/{id}/leader", id).cookie(cookie(LEADER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"" + MEMBER + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/study-groups/{id}/leader", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"" + MEMBER + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.leaderStudentId").value(MEMBER))
                .andExpect(jsonPath("$.status").value("ENDED"));
        assertThat(memberships.findByGroupIdAndStudentId(id, MEMBER).orElseThrow().getRole())
                .isEqualTo(StudyGroupMember.Role.LEADER);
    }

    @Test void appointingPendingLeaderStartsAttendanceEligibilityAtApproval() throws Exception {
        long id = propose();
        mvc.perform(post("/api/study-groups/{id}/approve", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(post("/api/study-groups/{id}/join", id).cookie(cookie(MEMBER)).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        StudyGroupMember pending = memberships.findByGroupIdAndStudentId(id, MEMBER).orElseThrow();
        pending.setJoinedAt(LocalDateTime.now().minusDays(2));
        memberships.saveAndFlush(pending);
        mvc.perform(put("/api/study-groups/{id}/leader", id).cookie(cookie(MANAGER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"studentId\":\"" + MEMBER + "\"}"))
                .andExpect(status().isOk());
        StudyGroupMember promoted = memberships.findByGroupIdAndStudentId(id, MEMBER).orElseThrow();
        assertThat(promoted.getStatus()).isEqualTo(StudyGroupMember.Status.APPROVED);
        assertThat(promoted.getRole()).isEqualTo(StudyGroupMember.Role.LEADER);
        assertThat(promoted.getJoinedAt()).isAfter(LocalDateTime.now().minusMinutes(1));
    }

    private long propose() throws Exception {
        byte[] body = mvc.perform(post("/api/study-groups").cookie(cookie(LEADER)).header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(write()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray();
        JsonNode payload = json.readTree(new String(body, StandardCharsets.UTF_8));
        return payload.get("id").asLong();
    }

    private static String write() {
        return "{\"name\":\"자바 스터디\",\"description\":\"함께 공부해요\",\"topicTags\":[\"Java\"],\"capacity\":2}";
    }

    private Cookie cookie(String studentId) { return new Cookie("token", tokens.generateToken(studentId, 0)); }
    private void save(String id, Member.Role role) {
        Member member = new Member();
        member.setStudentId(id);
        member.setName(id);
        member.setEmail(id + "@example.com");
        member.setPassword("test");
        member.setRole(role);
        members.save(member);
    }
}
