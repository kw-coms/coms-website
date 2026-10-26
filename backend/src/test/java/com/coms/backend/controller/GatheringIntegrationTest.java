package com.coms.backend.controller;

import com.coms.backend.domain.Gathering;
import com.coms.backend.domain.Member;
import com.coms.backend.repository.GatheringRepository;
import com.coms.backend.repository.GatheringSignupRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.GatheringService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Gatherings end to end through the real filter chain: who may open, sign up, see what and
 * manage; the limit of places; closing by hand and by time; the rules a new one has to keep;
 * and what goes with a removed account.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:gathering-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/gathering"
})
@AutoConfigureMockMvc
@Transactional
class GatheringIntegrationTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final String PRESIDENT = "2026000051";
    private static final String HOST = "2026000052";
    private static final String MEMBER = "2026000053";
    private static final String OTHER = "2026000054";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private MemberRepository memberRepository;
    @Autowired
    private GatheringRepository gatheringRepository;
    @Autowired
    private GatheringSignupRepository signupRepository;
    @Autowired
    private GatheringService gatheringService;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private Cookie presidentCookie;
    private Cookie hostCookie;
    private Cookie memberCookie;
    private Cookie otherCookie;

    @BeforeEach
    void setUp() {
        signupRepository.deleteAll();
        gatheringRepository.deleteAll();
        memberRepository.deleteAll();
        memberRepository.save(member(PRESIDENT, "회장", Member.Role.ADMIN));
        memberRepository.save(member(HOST, "연사람", Member.Role.USER));
        memberRepository.save(member(MEMBER, "부원", Member.Role.USER));
        memberRepository.save(member(OTHER, "다른부원", Member.Role.ASSOCIATE));
        presidentCookie = authCookie(PRESIDENT);
        hostCookie = authCookie(HOST);
        memberCookie = authCookie(MEMBER);
        otherCookie = authCookie(OTHER);
    }

    @Test
    void loggedOutVisitorsAreRefused() throws Exception {
        mockMvc.perform(get("/api/gatherings")).andExpect(status().isUnauthorized());
        join(null, 1L, null).andExpect(status().isUnauthorized());
    }

    @Test
    void aMemberOpensAGatheringAndOthersSignUpByName() throws Exception {
        MvcResult created = create(hostCookie, "{\"title\":\"  알고리즘 스터디  \",\"description\":\"매주 화요일\",\"capacity\":2,\"noteLabel\":\"하고 싶은 주제\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.gathering.title").value("알고리즘 스터디"))
                .andExpect(jsonPath("$.gathering.creatorName").value("연사람"))
                .andExpect(jsonPath("$.gathering.mine").value(true))
                .andExpect(jsonPath("$.gathering.canManage").value(true))
                .andExpect(jsonPath("$.gathering.open").value(true))
                .andExpect(jsonPath("$.gathering.full").value(false))
                .andExpect(jsonPath("$.gathering.participantCount").value(0))
                .andReturn();
        long id = json(created).get("gathering").get("id").asLong();

        join(memberCookie, id, "그래프")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.joined").value(true))
                .andExpect(jsonPath("$.participants.length()").value(1))
                .andExpect(jsonPath("$.participants[0].name").value("부원"))
                .andExpect(jsonPath("$.participants[0].mine").value(true))
                .andExpect(jsonPath("$.participants[0].note").value("그래프"));
        // Signing up again only replaces what was written.
        join(memberCookie, id, "  DP  ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participants.length()").value(1))
                .andExpect(jsonPath("$.participants[0].note").value("DP"));
        join(otherCookie, id, "문자열")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.full").value(true))
                .andExpect(jsonPath("$.gathering.participantCount").value(2));
        // Both places are taken.
        join(presidentCookie, id, null).andExpect(status().isConflict());
        assertThat(signupRepository.count()).isEqualTo(2);

        // A member sees who is coming and their own answer, not what the others wrote.
        MvcResult asMember = mockMvc.perform(get("/api/gatherings/{id}", id).cookie(memberCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.mine").value(false))
                .andExpect(jsonPath("$.gathering.canManage").value(false))
                .andExpect(jsonPath("$.participants[0].name").value("부원"))
                .andExpect(jsonPath("$.participants[0].note").value("DP"))
                .andExpect(jsonPath("$.participants[1].name").value("다른부원"))
                .andExpect(jsonPath("$.participants[1].mine").value(false))
                .andExpect(jsonPath("$.participants[1].note").doesNotExist())
                .andReturn();
        assertThat(asMember.getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain("문자열");

        // Whoever manages it (the member who opened it, the president) sees every answer.
        MvcResult asHost = mockMvc.perform(get("/api/gatherings/{id}", id).cookie(hostCookie))
                .andExpect(jsonPath("$.participants[0].note").value("DP"))
                .andExpect(jsonPath("$.participants[1].note").value("문자열"))
                .andReturn();
        mockMvc.perform(get("/api/gatherings/{id}", id).cookie(presidentCookie))
                .andExpect(jsonPath("$.gathering.mine").value(false))
                .andExpect(jsonPath("$.gathering.canManage").value(true))
                .andExpect(jsonPath("$.participants[1].note").value("문자열"));

        // The list says the same, per member.
        MvcResult list = mockMvc.perform(get("/api/gatherings").cookie(memberCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].joined").value(true))
                .andExpect(jsonPath("$[0].full").value(true))
                .andExpect(jsonPath("$[0].participantCount").value(2))
                .andExpect(jsonPath("$[0].noteLabel").value("하고 싶은 주제"))
                .andReturn();
        mockMvc.perform(get("/api/gatherings").cookie(presidentCookie)).andExpect(jsonPath("$[0].joined").value(false));

        // No student id leaves the server.
        for (MvcResult result : new MvcResult[]{created, asMember, asHost, list}) {
            assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                    .doesNotContain(HOST).doesNotContain(MEMBER).doesNotContain(OTHER).doesNotContain("studentId");
        }
    }

    @Test
    void leavingFreesAPlaceAndOnlyWhileTheGatheringIsOpen() throws Exception {
        long id = createAndGetId(hostCookie, "{\"title\":\"회식\",\"capacity\":1}");
        join(memberCookie, id, null).andExpect(status().isOk());
        join(otherCookie, id, null).andExpect(status().isConflict());

        mockMvc.perform(delete("/api/gatherings/{id}/signups/me", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.joined").value(false))
                .andExpect(jsonPath("$.gathering.participantCount").value(0));
        // Leaving again changes nothing.
        mockMvc.perform(delete("/api/gatherings/{id}/signups/me", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        join(otherCookie, id, null).andExpect(status().isOk());

        mockMvc.perform(post("/api/gatherings/{id}/close", id).cookie(hostCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.open").value(false))
                .andExpect(jsonPath("$.gathering.participantCount").value(1));
        // Closed: nobody signs up, and nobody slips out of the final list.
        join(memberCookie, id, null).andExpect(status().isConflict());
        mockMvc.perform(delete("/api/gatherings/{id}/signups/me", id).cookie(otherCookie).header("Origin", ORIGIN))
                .andExpect(status().isConflict());
        assertThat(signupRepository.count()).isEqualTo(1);
    }

    @Test
    void aGatheringClosesByItselfAtItsTime() throws Exception {
        String inAnHour = LocalDateTime.now().plusHours(1).withNano(0).toString();
        long id = createAndGetId(hostCookie, "{\"title\":\"MT\",\"closesAt\":\"" + inAnHour + "\"}");
        join(memberCookie, id, null).andExpect(status().isOk());

        Gathering gathering = gatheringRepository.findById(id).orElseThrow();
        gathering.setClosesAt(LocalDateTime.now().minusMinutes(1));
        gatheringRepository.saveAndFlush(gathering);

        join(otherCookie, id, null).andExpect(status().isConflict());
        mockMvc.perform(get("/api/gatherings").cookie(otherCookie))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].participantCount").value(1));
    }

    @Test
    void onlyTheMemberWhoOpenedItOrThePresidentManages() throws Exception {
        long id = createAndGetId(hostCookie, "{\"title\":\"스터디\"}");
        long elsewhere = createAndGetId(hostCookie, "{\"title\":\"다른 모임\"}");
        JsonNode joined = json(join(memberCookie, id, null).andReturn());
        long signupId = joined.get("participants").get(0).get("id").asLong();

        mockMvc.perform(post("/api/gatherings/{id}/close", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/gatherings/{id}", id).cookie(memberCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/gatherings/{id}/signups/{signupId}", id, signupId).cookie(otherCookie).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        assertThat(signupRepository.count()).isEqualTo(1);

        // A sign-up is taken off through its own gathering only.
        mockMvc.perform(delete("/api/gatherings/{id}/signups/{signupId}", elsewhere, signupId).cookie(hostCookie).header("Origin", ORIGIN))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/gatherings/{id}/signups/{signupId}", id, signupId).cookie(presidentCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participants.length()").value(0));

        mockMvc.perform(post("/api/gatherings/{id}/close", id).cookie(presidentCookie).header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gathering.open").value(false));
        mockMvc.perform(delete("/api/gatherings/{id}", id).cookie(hostCookie).header("Origin", ORIGIN))
                .andExpect(status().isNoContent());
        assertThat(gatheringRepository.existsById(id)).isFalse();
        mockMvc.perform(get("/api/gatherings/{id}", id).cookie(hostCookie)).andExpect(status().isNotFound());
    }

    @Test
    void anAnswerIsKeptOnlyWhenTheGatheringAsksAQuestion() throws Exception {
        long id = createAndGetId(hostCookie, "{\"title\":\"회식\"}");
        join(memberCookie, id, "묻지 않은 말")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participants[0].note").doesNotExist());
        assertThat(signupRepository.findAll()).allSatisfy(signup -> assertThat(signup.getNote()).isNull());
    }

    @Test
    void aGatheringThatBreaksTheRulesIsRefused() throws Exception {
        create(hostCookie, "{\"title\":\"   \"}").andExpect(status().isBadRequest());
        create(hostCookie, "{\"description\":\"제목 없음\"}").andExpect(status().isBadRequest());
        create(hostCookie, "{\"title\":\"스터디\",\"capacity\":0}").andExpect(status().isBadRequest());
        create(hostCookie, "{\"title\":\"스터디\",\"capacity\":501}").andExpect(status().isBadRequest());
        create(hostCookie, "{\"title\":\"스터디\",\"noteLabel\":\"" + "가".repeat(41) + "\"}").andExpect(status().isBadRequest());
        create(hostCookie, "{\"title\":\"스터디\",\"closesAt\":\"" + LocalDateTime.now().minusMinutes(5).withNano(0) + "\"}")
                .andExpect(status().isBadRequest());
        create(hostCookie, "{\"title\":\"스터디\",\"closesAt\":\"" + LocalDateTime.now().plusDays(400).withNano(0) + "\"}")
                .andExpect(status().isBadRequest());
        assertThat(gatheringRepository.count()).isZero();

        long id = createAndGetId(hostCookie, "{\"title\":\"스터디\",\"noteLabel\":\"한마디\"}");
        join(memberCookie, id, "가".repeat(101)).andExpect(status().isBadRequest());
        join(memberCookie, 999_999L, null).andExpect(status().isNotFound());
        assertThat(signupRepository.count()).isZero();
    }

    @Test
    void aMemberCanOpenOnlySoManyGatherings() throws Exception {
        for (int i = 0; i < 20; i++) {
            create(hostCookie, "{\"title\":\"모임 " + i + "\"}").andExpect(status().isCreated());
        }
        create(hostCookie, "{\"title\":\"하나 더\"}").andExpect(status().isConflict());
        // The limit is each member's own.
        create(memberCookie, "{\"title\":\"내 모임\"}").andExpect(status().isCreated());
    }

    @Test
    void aRemovedAccountsSignUpsAndGatheringsGoWithIt() throws Exception {
        long hosted = createAndGetId(hostCookie, "{\"title\":\"연사람의 모임\"}");
        long others = createAndGetId(memberCookie, "{\"title\":\"부원의 모임\"}");
        join(memberCookie, hosted, null).andExpect(status().isOk());
        join(hostCookie, others, null).andExpect(status().isOk());
        join(otherCookie, others, null).andExpect(status().isOk());

        gatheringService.deleteDataForMember(HOST);

        assertThat(gatheringRepository.existsById(hosted)).isFalse();
        assertThat(gatheringRepository.existsById(others)).isTrue();
        assertThat(signupRepository.findByGatheringIdOrderByCreatedAtAscIdAsc(others))
                .extracting(signup -> signup.getStudentId())
                .containsExactly(OTHER);
        assertThat(signupRepository.count()).isEqualTo(1);
    }

    private ResultActions create(Cookie cookie, String body) throws Exception {
        return mockMvc.perform(post("/api/gatherings")
                .cookie(cookie)
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private long createAndGetId(Cookie cookie, String body) throws Exception {
        return json(create(cookie, body).andExpect(status().isCreated()).andReturn()).get("gathering").get("id").asLong();
    }

    private ResultActions join(Cookie cookie, long id, String note) throws Exception {
        var request = post("/api/gatherings/{id}/signups", id)
                .header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(note == null ? "{}" : "{\"note\":\"" + note + "\"}");
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
