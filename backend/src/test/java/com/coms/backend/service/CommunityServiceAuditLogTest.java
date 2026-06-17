package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-service-audit-log-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class CommunityServiceAuditLogTest {
    @Autowired
    private CommunityService communityService;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private CommunityPostRepository communityPostRepository;

    @Autowired
    private CommunityPostVoteRepository voteRepository;

    @Autowired
    private CommunityPollVoteRepository pollVoteRepository;

    @Autowired
    private CommunityCommentRepository commentRepository;

    @Autowired
    private CommunityPostImageRepository imageRepository;

    @Autowired
    private CommunityPostVideoRepository videoRepository;

    @Autowired
    private CommunityPostFileRepository fileRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @BeforeEach
    @AfterEach
    void clean() {
        auditLogRepository.deleteAll();
        fileRepository.deleteAll();
        videoRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        voteRepository.deleteAll();
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void adminDeletionAuditLogKeepsPostAndModeratorSnapshot() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("삭제 감사 대상", "본문", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id());

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_DELETE"))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getActorStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(log.getActorName()).isEqualTo(admin.getName());
                    assertThat(log.getTargetType()).isEqualTo("COMMUNITY_POST");
                    assertThat(log.getTargetId()).isEqualTo(String.valueOf(created.id()));
                    assertThat(log.getDetail()).contains(
                            "title=삭제 감사 대상",
                            "author=작성자(2025123456)",
                            "deletedBy=관리자(2026123456)",
                            "deletedByRole=ADMIN"
                    );
                });
    }

    @Test
    void deletionAuditLogIncludesProvidedReason() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사유 감사 대상", "본문", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "스팸 홍보글 정리");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_DELETE"))
                .singleElement()
                .satisfies(log -> assertThat(log.getDetail()).contains("reason=스팸 홍보글 정리"));
    }

    @Test
    void deletionReasonCannotInjectExtraAuditLines() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사유 줄바꿈", "본문", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "스팸\ncategory=ANONYMOUS");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_DELETE"))
                .singleElement()
                .satisfies(log -> assertThat(log.getDetail())
                        .contains("reason=스팸 category=ANONYMOUS")
                        .doesNotContain("\ncategory=ANONYMOUS"));
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
