package com.coms.backend.controller;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:club-activity-authz-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-activity-authz"
})
@AutoConfigureMockMvc
@Transactional
class ClubActivityAuthorizationIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";

    @Autowired MockMvc mockMvc;
    @Autowired MemberRepository memberRepository;
    @Autowired ClubActivityRepository activityRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Cookie userCookie;
    private Cookie officerCookie;
    private Long activityId;

    @BeforeEach
    void setUp() {
        memberRepository.deleteAll();
        memberRepository.save(member("2026000001", Member.Role.OFFICER));
        memberRepository.save(member("2026000002", Member.Role.USER));
        officerCookie = new Cookie("token", jwtTokenProvider.generateToken("2026000001", 0));
        userCookie = new Cookie("token", jwtTokenProvider.generateToken("2026000002", 0));

        ClubActivity activity = new ClubActivity();
        activity.setTitle("기존 활동");
        activity.setCategory("EVENT");
        activity.setKind(ClubActivity.Kind.ACTIVITY);
        activity.setCreatedBy("2026000001");
        activity.setCreatedAt(LocalDateTime.now());
        activity.setUpdatedAt(LocalDateTime.now());
        activityId = activityRepository.saveAndFlush(activity).getId();
    }

    @Test
    void guestIsRejectedOnWriteAndPreviewEndpoints() throws Exception {
        mockMvc.perform(create(null)).andExpect(status().isUnauthorized());
        mockMvc.perform(update(null)).andExpect(status().isUnauthorized());
        mockMvc.perform(preview(null)).andExpect(status().isUnauthorized());
    }

    @Test
    void plainUserWithoutActivityWriteIsForbidden() throws Exception {
        mockMvc.perform(create(userCookie)).andExpect(status().isForbidden());
        mockMvc.perform(update(userCookie)).andExpect(status().isForbidden());
        mockMvc.perform(preview(userCookie)).andExpect(status().isForbidden());
    }

    @Test
    void officerWithActivityWriteSucceeds() throws Exception {
        mockMvc.perform(create(officerCookie)).andExpect(status().isOk());
        mockMvc.perform(update(officerCookie)).andExpect(status().isOk());
        mockMvc.perform(preview(officerCookie)).andExpect(status().isOk());
    }

    private MockHttpServletRequestBuilder create(Cookie cookie) {
        return withAuth(post("/api/club-activities")
                .param("kind", "ACTIVITY").param("category", "EVENT").param("title", "타임라인 활동")
                .param("eventDate", "2026-10-05").param("showOnTimeline", "true"), cookie);
    }

    private MockHttpServletRequestBuilder update(Cookie cookie) {
        return withAuth(patch("/api/club-activities/{id}", activityId)
                .param("title", "수정").param("showOnTimeline", "true"), cookie);
    }

    private MockHttpServletRequestBuilder preview(Cookie cookie) {
        return withAuth(get("/api/club-activities/status-preview").param("eventDate", "2026-10-05"), cookie);
    }

    private MockHttpServletRequestBuilder withAuth(MockHttpServletRequestBuilder request, Cookie cookie) {
        request.header("Origin", ORIGIN);
        return cookie == null ? request : request.cookie(cookie);
    }

    private Member member(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(role.name());
        member.setEmail(studentId + "@example.com");
        member.setPassword("unused");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
