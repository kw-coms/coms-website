package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
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
@WithMockUser(roles = "ADMIN")
class ClubActivityServiceTest {

    @Autowired
    private ClubActivityService clubActivityService;

    @Autowired
    private ClubActivityCategoryService clubActivityCategoryService;

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
        assertThat(response.categoryName()).isEqualTo("세미나");
        assertThat(response.title()).isEqualTo("정기 세미나");
        assertThat(response.description()).isEqualTo("React 상태 관리");
        assertThat(response.eventDate()).isEqualTo(LocalDate.of(2026, 6, 18));
        // The uploaded image is mirrored into the multi-image table, so the
        // primary imageUrl now resolves through the multi-image endpoint.
        assertThat(response.imageInfos()).hasSize(1);
        assertThat(response.imageUrl()).isEqualTo(response.imageInfos().get(0).url());
        assertThat(response.imageOriginalName()).isEqualTo("seminar.jpg");
        assertThat(response.fileInfos()).isEmpty();
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
    void createsScheduleRangeWithTimes() throws Exception {
        var response = clubActivityService.create(
                "SCHEDULE",
                "GENERAL",
                "신입 부원 OT",
                null,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                "18:30",
                "20:00",
                null,
                "2026123456"
        );

        assertThat(response.eventDate()).isEqualTo(LocalDate.of(2026, 6, 1));
        assertThat(response.endDate()).isEqualTo(LocalDate.of(2026, 6, 3));
        assertThat(response.startTime()).isEqualTo("18:30");
        assertThat(response.endTime()).isEqualTo("20:00");
        assertThat(response.description()).isNull();
    }

    @Test
    void createsAndUpdatesScheduleColor() throws Exception {
        var created = clubActivityService.create(
                "SCHEDULE",
                "MEETING",
                "색상 있는 회의",
                null,
                LocalDate.of(2026, 6, 4),
                LocalDate.of(2026, 6, 4),
                "18:00",
                "19:00",
                "#ff9f0a",
                null,
                "2026123456"
        );

        assertThat(created.colorHex()).isEqualTo("#ff9f0a");

        var updated = clubActivityService.update(
                created.id(),
                "SCHEDULE",
                "MEETING",
                "색상 변경 회의",
                null,
                LocalDate.of(2026, 6, 5),
                LocalDate.of(2026, 6, 5),
                "19:00",
                "20:00",
                "#34c759",
                "2026123456"
        );

        assertThat(updated.colorHex()).isEqualTo("#34c759");
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

    @Test
    void uploadsMultipleImagesAndFilesThenRemovesThem() throws Exception {
        var activity = clubActivityService.create("ACTIVITY", "SEMINAR", "다중 미디어", null,
                LocalDate.of(2026, 6, 18), null, "2026123456");

        var imageIds = clubActivityService.addImages(activity.id(), java.util.List.of(
                new MockMultipartFile("images", "a.png", "image/png", "a".getBytes()),
                new MockMultipartFile("images", "b.png", "image/png", "b".getBytes())
        ));
        assertThat(imageIds).hasSize(2);

        var fileId = clubActivityService.addFile(activity.id(),
                new MockMultipartFile("file", "notes.pdf", "application/pdf", "%PDF".getBytes()));
        assertThat(fileId).isNotNull();

        var detail = clubActivityService.getAndIncrementView(activity.id(), "2026123456");
        assertThat(detail.imageInfos()).hasSize(2);
        assertThat(detail.fileInfos()).hasSize(1);
        assertThat(detail.fileInfos().get(0).originalName()).isEqualTo("notes.pdf");

        clubActivityService.deleteImage(activity.id(), imageIds.get(0));
        clubActivityService.deleteFile(activity.id(), fileId);
        var after = clubActivityService.getAndIncrementView(activity.id(), "2026123456");
        assertThat(after.imageInfos()).hasSize(1);
        assertThat(after.fileInfos()).isEmpty();
    }

    @Test
    void updatesActivityFieldsPreservingViewsAndAuthor() throws Exception {
        var activity = clubActivityService.create("ACTIVITY", "SEMINAR", "이전 제목", "이전 내용",
                LocalDate.of(2026, 6, 18), null, "2026123456");
        clubActivityService.getAndIncrementView(activity.id(), "2026123456");

        var updated = clubActivityService.update(activity.id(), "ACTIVITY", "STUDY", "새 제목", "새 내용",
                LocalDate.of(2026, 7, 1), "2026123456");

        assertThat(updated.title()).isEqualTo("새 제목");
        assertThat(updated.description()).isEqualTo("새 내용");
        assertThat(updated.category()).isEqualTo("STUDY");
        assertThat(updated.eventDate()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(updated.createdByName()).isEqualTo("관리자");
        assertThat(updated.viewCount()).isEqualTo(1);
    }

    @Test
    void categoryCrudAndDeletionGuardWhenInUse() throws Exception {
        var created = clubActivityCategoryService.create(
                new com.coms.backend.dto.ClubActivityCategoryRequest(null, "해커톤", null));
        assertThat(created.key()).isNotBlank();
        assertThat(created.name()).isEqualTo("해커톤");

        var renamed = clubActivityCategoryService.update(created.id(),
                new com.coms.backend.dto.ClubActivityCategoryRequest(null, "대회", null));
        assertThat(renamed.name()).isEqualTo("대회");

        // Unused category can be deleted.
        clubActivityCategoryService.delete(created.id());

        // A category in use cannot be deleted.
        var inUse = clubActivityCategoryService.create(
                new com.coms.backend.dto.ClubActivityCategoryRequest(null, "워크숍", null));
        clubActivityService.create("ACTIVITY", inUse.key(), "워크숍 후기", null,
                LocalDate.of(2026, 6, 18), null, "2026123456");
        assertThatThrownBy(() -> clubActivityCategoryService.delete(inUse.id()))
                .isInstanceOf(ResponseStatusException.class);
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
