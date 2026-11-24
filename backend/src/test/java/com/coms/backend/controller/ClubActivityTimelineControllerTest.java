package com.coms.backend.controller;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.repository.ClubActivityRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:club-activity-timeline-controller-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Transactional
class ClubActivityTimelineControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ClubActivityRepository repository;

    @Test
    void guestSeesOnlyPublicTimelineFieldsAndMemberSeesMemberFacts() throws Exception {
        ClubActivity activity = new ClubActivity();
        activity.setTitle("공개 일정");
        activity.setCategory("EVENT");
        activity.setKind(ClubActivity.Kind.ACTIVITY);
        activity.setDescription("공개 설명");
        activity.setMemberFacts("회원 전용 안건");
        activity.setShowOnTimeline(true);
        activity.setTimelineStatus("PLANNED");
        activity.setTimelineTerm("2026 2학기");
        activity.setCreatedBy("2026123456");
        activity.setCreatedByName("비공개 작성자");
        activity.setCreatedAt(LocalDateTime.now());
        activity.setUpdatedAt(LocalDateTime.now());
        Long id = repository.saveAndFlush(activity).getId();
        ClubActivity hidden = new ClubActivity();
        hidden.setTitle("비공개 일정");
        hidden.setCategory("EVENT");
        hidden.setCreatedBy("2026123456");
        hidden.setCreatedAt(LocalDateTime.now());
        hidden.setUpdatedAt(LocalDateTime.now());
        repository.saveAndFlush(hidden);

        mvc.perform(get("/api/club-activities/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].title").value("공개 일정"))
                .andExpect(jsonPath("$[?(@.title == '비공개 일정')]").isEmpty())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].memberFacts").doesNotExist())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].createdBy").doesNotExist())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].createdByName").doesNotExist());

        mvc.perform(get("/api/club-activities/timeline").with(user("2026000000")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].memberFacts").value("회원 전용 안건"));
    }
}
