package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.ClubEventEntryRepository;
import com.coms.backend.repository.ClubEventRepository;
import com.coms.backend.repository.ClubEventRsvpRepository;
import com.coms.backend.repository.ClubEventVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:club-event-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-event-service"
})
@Transactional
class ClubEventServiceTest {

    @Autowired
    private ClubEventService clubEventService;

    @Autowired
    private ClubEventRepository clubEventRepository;

    @Autowired
    private ClubEventEntryRepository clubEventEntryRepository;

    @Autowired
    private ClubEventVoteRepository clubEventVoteRepository;

    @Autowired
    private ClubEventRsvpRepository clubEventRsvpRepository;

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        clubEventRsvpRepository.deleteAll();
        clubEventVoteRepository.deleteAll();
        clubEventEntryRepository.deleteAll();
        clubEventRepository.deleteAll();
        memberRepository.deleteAll();
        saveMember("2026123456", "관리자", Member.Role.ADMIN);
        saveMember("2026000001", "투표회원", Member.Role.USER);
    }

    @Test
    void adminCreatesEventAddsEntriesAndMemberVoteProducesRanking() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        var event = clubEventService.createEvent(
                "회지 인기투표",
                "가장 좋았던 회지를 골라주세요.",
                now.minusHours(1),
                now.plusDays(1),
                "2026123456"
        );
        var springIssue = clubEventService.addEntry(event.id(), "봄호", "편집팀", "봄 활동 회지",
                "MAGAZINE", "봄 활동을 묶은 회지입니다.", "봄, PDF", "https://coms.kw.ac.kr/archive/spring",
                List.of(pdf("spring.pdf")), "2026123456");
        var summerIssue = clubEventService.addEntry(event.id(), "여름호", "운영팀", "여름 활동 회지",
                "WEBZINE", "여름 활동을 웹진으로 정리했습니다.", "여름, 웹진", "https://coms.kw.ac.kr/archive/summer",
                List.of(pdf("summer.pdf"), pdf("summer-source.zip")), "2026123456");

        var voted = clubEventService.vote(event.id(), summerIssue.id(), "2026000001");

        assertThat(voted.myEntryId()).isEqualTo(summerIssue.id());
        assertThat(voted.totalVotes()).isEqualTo(1);
        assertThat(voted.entries()).extracting("id").containsExactly(summerIssue.id(), springIssue.id());
        assertThat(voted.entries().get(0).rank()).isEqualTo(1);
        assertThat(voted.entries().get(0).voteCount()).isEqualTo(1);
        assertThat(voted.entries().get(0).myVote()).isTrue();
        assertThat(voted.entries().get(0).workType()).isEqualTo("WEBZINE");
        assertThat(voted.entries().get(0).summary()).isEqualTo("여름 활동을 웹진으로 정리했습니다.");
        assertThat(voted.entries().get(0).tags()).isEqualTo("여름, 웹진");
        assertThat(voted.entries().get(0).externalUrl()).isEqualTo("https://coms.kw.ac.kr/archive/summer");
        assertThat(voted.entries().get(0).downloadUrl())
                .isEqualTo("/api/club-events/" + event.id() + "/entries/" + summerIssue.id() + "/download");
        assertThat(voted.entries().get(0).files())
                .extracting("originalName")
                .containsExactly("summer.pdf", "summer-source.zip");
    }

    @Test
    void memberCanChangeExactlyOneVoteInsideEvent() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        var event = clubEventService.createEvent("회지 인기투표", null,
                now.minusHours(1), now.plusDays(1), "2026123456");
        var first = clubEventService.addEntry(event.id(), "1호", "A팀", null,
                null, null, null, null, List.of(pdf("one.pdf")), "2026123456");
        var second = clubEventService.addEntry(event.id(), "2호", "B팀", null,
                null, null, null, null, List.of(pdf("two.pdf")), "2026123456");

        clubEventService.vote(event.id(), first.id(), "2026000001");
        var changed = clubEventService.vote(event.id(), second.id(), "2026000001");

        assertThat(changed.myEntryId()).isEqualTo(second.id());
        assertThat(changed.totalVotes()).isEqualTo(1);
        assertThat(changed.entries()).filteredOn(entry -> entry.id().equals(first.id()))
                .singleElement()
                .satisfies(entry -> {
                    assertThat(entry.voteCount()).isZero();
                    assertThat(entry.myVote()).isFalse();
                });
        assertThat(changed.entries()).filteredOn(entry -> entry.id().equals(second.id()))
                .singleElement()
                .satisfies(entry -> {
                    assertThat(entry.voteCount()).isEqualTo(1);
                    assertThat(entry.myVote()).isTrue();
                });
    }

    @Test
    void rejectsVoteOutsideVotingWindowAndCrossEventEntry() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        var closed = clubEventService.createEvent("종료된 이벤트", null,
                now.minusDays(2), now.minusDays(1), "2026123456");
        var closedEntry = clubEventService.addEntry(closed.id(), "지난 회지", "편집팀", null,
                null, null, null, null, List.of(pdf("old.pdf")), "2026123456");

        assertThatThrownBy(() -> clubEventService.vote(closed.id(), closedEntry.id(), "2026000001"))
                .isInstanceOf(ResponseStatusException.class);

        var open = clubEventService.createEvent("진행 중 이벤트", null,
                now.minusHours(1), now.plusDays(1), "2026123456");
        assertThatThrownBy(() -> clubEventService.vote(open.id(), closedEntry.id(), "2026000001"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void memberRsvpUpsertsExactlyOneRowAndAggregatesCounts() {
        LocalDateTime now = LocalDateTime.now();
        var event = clubEventService.createEvent("정기 모임", "참석 응답을 남겨주세요.",
                now.minusHours(1), now.plusDays(1), "2026123456");

        var going = clubEventService.rsvp(event.id(), "2026000001", "GOING");
        assertThat(going.myRsvpStatus()).isEqualTo("GOING");
        assertThat(going.goingCount()).isEqualTo(1);
        assertThat(going.maybeCount()).isZero();
        assertThat(going.notGoingCount()).isZero();

        var changed = clubEventService.rsvp(event.id(), "2026000001", "NOT_GOING");
        assertThat(changed.myRsvpStatus()).isEqualTo("NOT_GOING");
        assertThat(changed.goingCount()).isZero();
        assertThat(changed.notGoingCount()).isEqualTo(1);

        assertThat(clubEventRsvpRepository.findByClubEventId(event.id())).hasSize(1);
    }

    @Test
    void rsvpRejectsUnknownStatus() {
        LocalDateTime now = LocalDateTime.now();
        var event = clubEventService.createEvent("정기 모임", null,
                now.minusHours(1), now.plusDays(1), "2026123456");

        assertThatThrownBy(() -> clubEventService.rsvp(event.id(), "2026000001", "DEFINITELY"))
                .isInstanceOf(ResponseStatusException.class);
    }

    private MockMultipartFile pdf(String filename) {
        return new MockMultipartFile("file", filename, "application/pdf", "%PDF-event".getBytes());
    }

    private void saveMember(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(role);
        memberRepository.save(member);
    }
}
