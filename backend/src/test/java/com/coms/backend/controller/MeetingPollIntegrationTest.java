package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MeetingPollAvailabilityRepository;
import com.coms.backend.repository.MeetingPollRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.MeetingPollService;
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

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Meeting polls end to end through the real filter chain: members only, the rules a poll and
 * an answer have to satisfy, what other members are shown (names, never student ids), who may
 * delete, and what goes with a deleted account.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:meeting-poll-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/meeting-poll"
})
@AutoConfigureMockMvc
@Transactional
class MeetingPollIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String CREATOR = "2026000021";
    private static final String OTHER = "2026000022";
    private static final String PRESIDENT = "2026000023";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private MeetingPollRepository pollRepository;
    @Autowired
    private MeetingPollAvailabilityRepository availabilityRepository;
    @Autowired
    private MeetingPollService meetingPollService;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private Cookie creatorCookie;
    private Cookie otherCookie;
    private Cookie presidentCookie;

    @BeforeEach
    void setUp() {
        availabilityRepository.deleteAll();
        pollRepository.deleteAll();
        memberRepository.deleteAll();
        memberRepository.save(member(CREATOR, "만든이", Member.Role.USER));
        memberRepository.save(member(OTHER, "다른부원", Member.Role.ASSOCIATE));
        memberRepository.save(member(PRESIDENT, "회장", Member.Role.ADMIN));
        creatorCookie = authCookie(CREATOR);
        otherCookie = authCookie(OTHER);
        presidentCookie = authCookie(PRESIDENT);
    }

    @Test
    void loggedOutVisitorsAreRefused() throws Exception {
        mockMvc.perform(get("/api/meeting-polls")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/meeting-polls/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/meeting-polls")
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pollBody("모임", 600, 720, today().plusDays(1))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aMemberOpensAPollAndMembersAnswerIt() throws Exception {
        LocalDate first = today().plusDays(2);
        LocalDate second = today().plusDays(3);
        // Sent out of order and twice: stored once each, sorted.
        long id = createPoll(creatorCookie, pollBody("  스터디 시간 정하기  ", 600, 720, second, first, second));

        mockMvc.perform(get("/api/meeting-polls/{id}", id).cookie(otherCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.poll.title").value("스터디 시간 정하기"))
                .andExpect(jsonPath("$.poll.creatorName").value("만든이"))
                .andExpect(jsonPath("$.poll.mine").value(false))
                .andExpect(jsonPath("$.poll.canDelete").value(false))
                .andExpect(jsonPath("$.poll.dates.length()").value(2))
                .andExpect(jsonPath("$.poll.dates[0]").value(first.toString()))
                .andExpect(jsonPath("$.poll.dates[1]").value(second.toString()))
                .andExpect(jsonPath("$.poll.slotMinutes").value(30))
                .andExpect(jsonPath("$.poll.participantCount").value(0))
                .andExpect(jsonPath("$.participants.length()").value(0));

        // 2 dates x 4 half-hours = 8 slots.
        saveAvailability(id, creatorCookie, "11000011").andExpect(status().isOk());
        MvcResult saved = saveAvailability(id, otherCookie, "01100000")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.poll.participantCount").value(2))
                .andExpect(jsonPath("$.poll.answered").value(true))
                .andExpect(jsonPath("$.participants.length()").value(2))
                .andExpect(jsonPath("$.participants[0].name").value("만든이"))
                .andExpect(jsonPath("$.participants[0].mine").value(false))
                .andExpect(jsonPath("$.participants[0].slots").value("11000011"))
                .andExpect(jsonPath("$.participants[1].name").value("다른부원"))
                .andExpect(jsonPath("$.participants[1].mine").value(true))
                .andReturn();
        // Other members are shown names only.
        String body = saved.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain(CREATOR).doesNotContain(OTHER).doesNotContain("studentId");

        // Answering again replaces the earlier answer instead of adding a second one.
        saveAvailability(id, otherCookie, "00000000")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.poll.participantCount").value(2))
                .andExpect(jsonPath("$.participants[1].slots").value("00000000"));

        mockMvc.perform(get("/api/meeting-polls").cookie(creatorCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].mine").value(true))
                .andExpect(jsonPath("$[0].canDelete").value(true))
                .andExpect(jsonPath("$[0].participantCount").value(2))
                .andExpect(jsonPath("$[0].answered").value(true));

        // Withdrawing removes the row.
        mockMvc.perform(delete("/api/meeting-polls/{id}/availability", id).cookie(otherCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.poll.participantCount").value(1))
                .andExpect(jsonPath("$.poll.answered").value(false));
    }

    @Test
    void aPollThatBreaksTheRulesIsRefused() throws Exception {
        LocalDate day = today().plusDays(1);
        expectBadPoll(pollBody("   ", 600, 720, day));
        expectBadPoll(pollBody("모임", 720, 600, day));
        expectBadPoll(pollBody("모임", 600, 600, day));
        expectBadPoll(pollBody("모임", 605, 720, day));
        expectBadPoll(pollBody("모임", -30, 720, day));
        expectBadPoll(pollBody("모임", 600, 1470, day));
        expectBadPoll(pollBody("모임", 600, 720, today().minusDays(3)));
        expectBadPoll(pollBody("모임", 600, 720, today().plusDays(400)));
        expectBadPoll("{\"title\":\"모임\",\"dates\":[],\"startMinute\":600,\"endMinute\":720}");
        LocalDate[] tooMany = new LocalDate[15];
        for (int i = 0; i < tooMany.length; i++) tooMany[i] = today().plusDays(i + 1);
        expectBadPoll(pollBody("모임", 600, 720, tooMany));
        assertThat(pollRepository.count()).isZero();
    }

    @Test
    void anAnswerHasToFitTheGrid() throws Exception {
        long id = createPoll(creatorCookie, pollBody("모임", 600, 720, today().plusDays(1)));
        saveAvailability(id, otherCookie, "111").andExpect(status().isBadRequest());
        saveAvailability(id, otherCookie, "11111").andExpect(status().isBadRequest());
        saveAvailability(id, otherCookie, "1x11").andExpect(status().isBadRequest());
        saveAvailability(id, otherCookie, "1111").andExpect(status().isOk());
        saveAvailability(999_999L, otherCookie, "1111").andExpect(status().isNotFound());
        assertThat(availabilityRepository.count()).isEqualTo(1);
    }

    @Test
    void onlyTheCreatorOrThePresidentMayDeleteAPoll() throws Exception {
        long first = createPoll(creatorCookie, pollBody("첫 모임", 600, 720, today().plusDays(1)));
        long second = createPoll(creatorCookie, pollBody("둘째 모임", 600, 720, today().plusDays(1)));
        saveAvailability(first, otherCookie, "1111").andExpect(status().isOk());

        mockMvc.perform(delete("/api/meeting-polls/{id}", first).cookie(otherCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        assertThat(pollRepository.existsById(first)).isTrue();

        mockMvc.perform(delete("/api/meeting-polls/{id}", first).cookie(creatorCookie).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        assertThat(pollRepository.existsById(first)).isFalse();
        assertThat(availabilityRepository.count()).as("the answers go with the poll").isZero();

        mockMvc.perform(get("/api/meeting-polls/{id}", second).cookie(presidentCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.poll.mine").value(false))
                .andExpect(jsonPath("$.poll.canDelete").value(true));
        mockMvc.perform(delete("/api/meeting-polls/{id}", second).cookie(presidentCookie).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        assertThat(pollRepository.count()).isZero();
    }

    @Test
    void aMemberCannotOpenPollsWithoutLimit() throws Exception {
        String body = pollBody("모임", 600, 720, today().plusDays(1));
        for (int i = 0; i < 20; i++) createPoll(creatorCookie, body);
        mockMvc.perform(post("/api/meeting-polls")
                        .cookie(creatorCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict());
        // The limit is per member.
        createPoll(otherCookie, body);
    }

    @Test
    void aDeletedAccountsPollDataGoesWithIt() throws Exception {
        long mine = createPoll(creatorCookie, pollBody("내가 연 모임", 600, 720, today().plusDays(1)));
        long theirs = createPoll(otherCookie, pollBody("남이 연 모임", 600, 720, today().plusDays(1)));
        saveAvailability(mine, otherCookie, "1111").andExpect(status().isOk());
        saveAvailability(theirs, creatorCookie, "1010").andExpect(status().isOk());
        saveAvailability(theirs, otherCookie, "0101").andExpect(status().isOk());

        meetingPollService.deleteDataForMember(CREATOR);

        assertThat(pollRepository.existsById(mine)).as("the poll the member opened").isFalse();
        assertThat(pollRepository.existsById(theirs)).as("another member's poll").isTrue();
        assertThat(availabilityRepository.findByPollIdOrderByUpdatedAtAscIdAsc(theirs))
                .as("only the other member's answer is left")
                .extracting(a -> a.getStudentId())
                .containsExactly(OTHER);
        assertThat(availabilityRepository.count()).isEqualTo(1);
    }

    private LocalDate today() {
        return LocalDate.now();
    }

    private long createPoll(Cookie cookie, String body) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/meeting-polls")
                        .cookie(cookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return json.get("poll").get("id").asLong();
    }

    private void expectBadPoll(String body) throws Exception {
        mockMvc.perform(post("/api/meeting-polls")
                        .cookie(creatorCookie)
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    private org.springframework.test.web.servlet.ResultActions saveAvailability(long id, Cookie cookie, String slots) throws Exception {
        return mockMvc.perform(put("/api/meeting-polls/{id}/availability", id)
                .cookie(cookie)
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"slots\":\"" + slots + "\"}"));
    }

    private String pollBody(String title, int startMinute, int endMinute, LocalDate... dates) {
        StringBuilder json = new StringBuilder("{\"title\":\"").append(title).append("\",\"description\":\"\",\"dates\":[");
        for (int i = 0; i < dates.length; i++) {
            if (i > 0) json.append(',');
            json.append('"').append(dates[i]).append('"');
        }
        return json.append("],\"startMinute\":").append(startMinute).append(",\"endMinute\":").append(endMinute).append('}').toString();
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
