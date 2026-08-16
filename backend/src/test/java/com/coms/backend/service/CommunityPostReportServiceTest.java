package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostReportRequest;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityPostReportRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-report-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class CommunityPostReportServiceTest {
    @Autowired
    private CommunityPostReportService reportService;

    @Autowired
    private CommunityPostRepository postRepository;

    @Autowired
    private CommunityPostReportRepository reportRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private MemberRepository memberRepository;

    private static final String REPORTER_ID = "2026123456";

    @BeforeEach
    void clean() {
        auditLogRepository.deleteAll();
        reportRepository.deleteAll();
        postRepository.deleteAll();
        memberRepository.deleteAll();
        // report() now requires the reporter to be a resolvable, permitted member.
        memberRepository.save(member(REPORTER_ID, "신고자", Member.Role.USER));
    }

    @Test
    void listOpenIncludesReportedPostTitle() {
        CommunityPost post = new CommunityPost();
        post.setTitle("신고 대상 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.save(post);

        reportService.report(saved.getId(), REPORTER_ID, new CommunityPostReportRequest("SPAM", "홍보"));

        assertThat(reportService.listOpen())
                .singleElement()
                .satisfies(report -> {
                    assertThat(report.postId()).isEqualTo(saved.getId());
                    assertThat(report.postTitle()).isEqualTo("신고 대상 글");
                });
    }

    @Test
    void reportStoresPostSnapshotForModerationHistory() {
        CommunityPost post = new CommunityPost();
        post.setTitle("스냅샷 대상 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.save(post);

        var response = reportService.report(saved.getId(), REPORTER_ID, new CommunityPostReportRequest("ABUSE", "비방"));

        // The reporter-facing response must NOT carry the author's identity (deanonymization),
        // but the persisted report keeps the full snapshot for admin moderation.
        assertThat(response.postTitle()).isEqualTo("스냅샷 대상 글");
        assertThat(response.postAuthorStudentId()).isNull();
        assertThat(response.postAuthorName()).isNull();
        assertThat(reportRepository.findById(response.id()))
                .get()
                .satisfies(report -> {
                    assertThat(report.getPostTitle()).isEqualTo("스냅샷 대상 글");
                    assertThat(report.getPostAuthorStudentId()).isEqualTo("2025123456");
                    assertThat(report.getPostAuthorName()).isEqualTo("작성자");
                });
    }

    @Test
    void graduateCannotReportAnonymousPostToDeanonymizeIt() {
        // Graduates are blocked from viewing the anonymous board; reporting must not be a bypass.
        memberRepository.save(member("2015123456", "졸업생", Member.Role.USER));
        CommunityPost post = new CommunityPost();
        post.setTitle("익명 글");
        post.setContent("본문");
        post.setCategory(CommunityPost.Category.ANONYMOUS);
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("익명작성자");
        CommunityPost saved = postRepository.save(post);

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                        reportService.report(saved.getId(), "2015123456", new CommunityPostReportRequest("ABUSE", "x")))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(reportRepository.count()).isZero();
    }

    @Test
    void openReportKeepsSnapshotAfterReportedPostIsDeleted() {
        CommunityPost post = new CommunityPost();
        post.setTitle("삭제될 신고 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.saveAndFlush(post);
        var report = reportService.report(saved.getId(), REPORTER_ID, new CommunityPostReportRequest("SPAM", "홍보"));

        postRepository.deleteById(saved.getId());
        postRepository.flush();

        assertThat(reportRepository.findById(report.id())).isPresent();
        assertThat(reportService.listOpen())
                .singleElement()
                .satisfies(open -> {
                    assertThat(open.postId()).isNull();
                    assertThat(open.postTitle()).isEqualTo("삭제될 신고 글");
                    assertThat(open.postAuthorStudentId()).isEqualTo("2025123456");
                    assertThat(open.postAuthorName()).isEqualTo("작성자");
                });
    }

    @Test
    void acceptingReportWritesAuditLogWithReportAndPostSnapshot() {
        Member resolver = member("2026000001", "관리자", Member.Role.ADMIN);
        memberRepository.save(resolver);
        CommunityPost post = new CommunityPost();
        post.setTitle("처리 대상 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.save(post);
        var report = reportService.report(saved.getId(), REPORTER_ID, new CommunityPostReportRequest("PRIVACY", "개인정보 포함"));

        reportService.resolve(report.id(), resolver.getStudentId(), "ACCEPT", "게시글 삭제 완료");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_REPORT_ACCEPT"))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getActorStudentId()).isEqualTo(resolver.getStudentId());
                    assertThat(log.getActorName()).isEqualTo("관리자");
                    assertThat(log.getTargetType()).isEqualTo("COMMUNITY_POST_REPORT");
                    assertThat(log.getTargetId()).isEqualTo(String.valueOf(report.id()));
                    assertThat(log.getDetail()).contains(
                            "postId=" + saved.getId(),
                            "title=처리 대상 글",
                            "author=작성자(2025123456)",
                            "reporter=2026123456",
                            "resolvedBy=관리자(2026000001)",
                            "reason=PRIVACY",
                            "note=게시글 삭제 완료"
                    );
                });
    }

    @Test
    void rejectingReportWritesAuditLogWithDecision() {
        Member resolver = member("2026000001", "관리자", Member.Role.ADMIN);
        memberRepository.save(resolver);
        CommunityPost post = new CommunityPost();
        post.setTitle("기각 대상 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.save(post);
        var report = reportService.report(saved.getId(), REPORTER_ID, new CommunityPostReportRequest("MISLEADING", "오해 소지"));

        reportService.resolve(report.id(), resolver.getStudentId(), "REJECT", "운영 기준상 문제 없음");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_REPORT_REJECT"))
                .singleElement()
                .satisfies(log -> assertThat(log.getDetail()).contains(
                        "postId=" + saved.getId(),
                        "title=기각 대상 글",
                        "reason=MISLEADING",
                        "note=운영 기준상 문제 없음"
                ));
    }

    private Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded-password");
        member.setRole(role);
        return member;
    }
}
