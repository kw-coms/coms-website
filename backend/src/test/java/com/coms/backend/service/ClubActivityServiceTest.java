package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:club-activity-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-activity-service"
})
@Transactional
class ClubActivityServiceTest {

    @Autowired
    private ClubActivityService clubActivityService;

    @Autowired
    private ClubActivityRepository clubActivityRepository;

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        clubActivityRepository.deleteAll();
        memberRepository.deleteAll();
        saveMember("2026123456", "관리자");
    }

    @Test
    void createsActivityRecordWithImageMetadataAndCreatorName() throws Exception {
        MockMultipartFile image = new MockMultipartFile(
                "image",
                "seminar.jpg",
                "image/jpeg",
                "jpg-bytes".getBytes()
        );

        var response = clubActivityService.create(
                "ACTIVITY",
                "SEMINAR",
                "정기 세미나",
                "React 상태 관리",
                LocalDate.of(2026, 6, 18),
                image,
                "2026123456"
        );

        assertThat(response.kind()).isEqualTo("ACTIVITY");
        assertThat(response.category()).isEqualTo("SEMINAR");
        assertThat(response.title()).isEqualTo("정기 세미나");
        assertThat(response.description()).isEqualTo("React 상태 관리");
        assertThat(response.eventDate()).isEqualTo(LocalDate.of(2026, 6, 18));
        assertThat(response.imageUrl()).isEqualTo("/api/club-activities/" + response.id() + "/image");
        assertThat(response.imageOriginalName()).isEqualTo("seminar.jpg");
        assertThat(response.createdByName()).isEqualTo("관리자");
    }

    @Test
    void createsScheduleWithoutImageAndListsNewestFirst() throws Exception {
        clubActivityService.create("SCHEDULE", "MEETING", "정기 회의", null, LocalDate.of(2026, 6, 1), null, "2026123456");
        clubActivityService.create("SCHEDULE", "PROJECT", "프로젝트 발표", null, LocalDate.of(2026, 6, 20), null, "2026123456");

        var responses = clubActivityService.list();

        assertThat(responses).extracting("title").containsExactly("프로젝트 발표", "정기 회의");
        assertThat(responses.get(0).imageUrl()).isNull();
    }

    @Test
    void detailFetchIncrementsViewCountAndUpvoteTogglesMyVote() throws Exception {
        var activity = clubActivityService.create("ACTIVITY", "SEMINAR", "세미나", null, LocalDate.of(2026, 6, 18), null, "2026123456");

        var firstView = clubActivityService.getAndIncrementView(activity.id(), "2026123456");
        var secondView = clubActivityService.getAndIncrementView(activity.id(), "2026123456");
        assertThat(firstView.viewCount()).isEqualTo(1);
        assertThat(secondView.viewCount()).isEqualTo(2);

        var upvoted = clubActivityService.vote("2026123456", activity.id(), 1);
        assertThat(upvoted.upvotes()).isEqualTo(1);
        assertThat(upvoted.myVote()).isEqualTo(1);

        var cleared = clubActivityService.vote("2026123456", activity.id(), 1);
        assertThat(cleared.upvotes()).isZero();
        assertThat(cleared.myVote()).isZero();

        assertThat(clubActivityService.list("2026123456"))
                .filteredOn(item -> item.id().equals(activity.id()))
                .singleElement()
                .satisfies(item -> assertThat(item.viewCount()).isEqualTo(2));
    }

    @Test
    void rejectsNonImageActivityUpload() {
        MockMultipartFile pdf = new MockMultipartFile(
                "image",
                "notes.pdf",
                "application/pdf",
                "%PDF".getBytes()
        );

        assertThatThrownBy(() -> clubActivityService.create(
                "ACTIVITY",
                "SEMINAR",
                "세미나",
                null,
                LocalDate.of(2026, 6, 18),
                pdf,
                "2026123456"
        )).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsScheduleImageUpload() {
        MockMultipartFile image = new MockMultipartFile(
                "image",
                "schedule.jpg",
                "image/jpeg",
                "jpg-bytes".getBytes()
        );

        assertThatThrownBy(() -> clubActivityService.create(
                "SCHEDULE",
                "MEETING",
                "정기 회의",
                null,
                LocalDate.of(2026, 6, 18),
                image,
                "2026123456"
        )).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsInvalidKindAndCategory() {
        assertThatThrownBy(() -> clubActivityService.create(
                "NOTICE",
                "SEMINAR",
                "잘못된 종류",
                null,
                LocalDate.of(2026, 6, 18),
                null,
                "2026123456"
        )).isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> clubActivityService.create(
                "ACTIVITY",
                "UNKNOWN",
                "잘못된 분류",
                null,
                LocalDate.of(2026, 6, 18),
                null,
                "2026123456"
        )).isInstanceOf(ResponseStatusException.class);
    }

    private void saveMember(String studentId, String name) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(Member.Role.ADMIN);
        memberRepository.save(member);
    }
}
