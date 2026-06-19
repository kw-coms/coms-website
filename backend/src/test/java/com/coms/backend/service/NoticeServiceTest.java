package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notice-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class NoticeServiceTest {

    @Autowired
    private NoticeService noticeService;

    @Autowired
    private NoticeRepository noticeRepository;

    @Autowired
    private MemberRepository memberRepository;

    @BeforeEach
    void setUp() {
        noticeRepository.deleteAll();
        memberRepository.deleteAll();
        memberRepository.save(admin("2026123000", "관리자"));
    }

    @Test
    void defaultsNoticeCategoryToGeneral() {
        var notice = noticeService.create("2026123000", new NoticeRequest("공지", "내용", "스푸핑", false, null));

        assertThat(notice.category()).isEqualTo("GENERAL");
        assertThat(notice.author()).isEqualTo("관리자");
    }

    @Test
    void createsJobNoticeCategory() {
        var notice = noticeService.create("2026123000", new NoticeRequest("채용", "취업공고", null, true, "JOB"));

        assertThat(notice.category()).isEqualTo("JOB");
    }

    @Test
    void createsPromotionNoticeCategory() {
        var notice = noticeService.create("2026123000", new NoticeRequest("홍보", "행사 홍보", null, false, "PROMOTION"));

        assertThat(notice.category()).isEqualTo("PROMOTION");
    }

    @Test
    void createsSmallGroupNoticeCategory() {
        var notice = noticeService.create("2026123000", new NoticeRequest("소모임", "소모임 안내", null, false, "SMALL_GROUP"));

        assertThat(notice.category()).isEqualTo("SMALL_GROUP");
    }

    @Test
    void detailFetchIncrementsViewCount() {
        var notice = noticeService.create("2026123000", new NoticeRequest("공지", "내용", null, false, null));

        var first = noticeService.getAndIncrementView(notice.id(), "2026123000");
        var second = noticeService.getAndIncrementView(notice.id(), "2026123000");

        assertThat(first.viewCount()).isEqualTo(1);
        assertThat(second.viewCount()).isEqualTo(2);
    }

    @Test
    void upvoteTogglesAndTracksMyVote() {
        var notice = noticeService.create("2026123000", new NoticeRequest("공지", "내용", null, false, null));

        var upvoted = noticeService.vote("2026123000", notice.id(), 1);
        assertThat(upvoted.upvotes()).isEqualTo(1);
        assertThat(upvoted.myVote()).isEqualTo(1);

        var cleared = noticeService.vote("2026123000", notice.id(), 1);
        assertThat(cleared.upvotes()).isZero();
        assertThat(cleared.myVote()).isZero();
    }

    @Test
    void listExposesEngagementCountsWithViewerVote() {
        var notice = noticeService.create("2026123000", new NoticeRequest("공지", "내용", null, false, null));
        noticeService.vote("2026123000", notice.id(), 1);

        assertThat(noticeService.list("2026123000"))
                .filteredOn(item -> item.id().equals(notice.id()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.upvotes()).isEqualTo(1);
                    assertThat(item.myVote()).isEqualTo(1);
                });
        assertThat(noticeService.list(null))
                .filteredOn(item -> item.id().equals(notice.id()))
                .singleElement()
                .satisfies(item -> assertThat(item.myVote()).isZero());
    }

    @Test
    void updateIgnoresClientSuppliedAuthor() {
        var notice = noticeService.create("2026123000", new NoticeRequest("공지", "내용", "가짜", false, null));

        var updated = noticeService.update("2026123000", notice.id(), new NoticeRequest("수정", "수정 내용", "다른 작성자", false, "GENERAL"));

        assertThat(updated.author()).isEqualTo("관리자");
        assertThat(updated.title()).isEqualTo("수정");
    }

    private Member admin(String studentId, String name) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("encoded-password");
        member.setEmailVerified(true);
        member.setRole(Member.Role.ADMIN);
        return member;
    }
}
