package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Autowired
    private DeletedCommunityPostRepository deletedCommunityPostRepository;

    @BeforeEach
    @AfterEach
    void clean() {
        deletedCommunityPostRepository.deleteAll();
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

        communityService.delete(admin.getStudentId(), created.id(), "운영 기준 위반");

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
    void adminDeletionAuditLogKeepsDeletedPostContentSnapshot() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("본문 감사 대상", "억울한 삭제를 막기 위한 원문 본문입니다.", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "원문 확인");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_DELETE"))
                .singleElement()
                .satisfies(log -> assertThat(log.getDetail()).contains(
                        "title=본문 감사 대상",
                        "content=억울한 삭제를 막기 위한 원문 본문입니다."
                ));
    }

    @Test
    void adminDeletionArchivesFullDeletedPostEvidence() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        String content = "보관해야 하는 삭제 원문입니다.\n두 번째 줄까지 보존합니다.";
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("원문 보관 대상", content, "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "운영 규칙 위반");

        assertThat(deletedCommunityPostRepository.findAll())
                .singleElement()
                .satisfies(snapshot -> {
                    assertThat(snapshot.getOriginalPostId()).isEqualTo(created.id());
                    assertThat(snapshot.getTitle()).isEqualTo("원문 보관 대상");
                    assertThat(snapshot.getContent()).isEqualTo(content);
                    assertThat(snapshot.getAuthorStudentId()).isEqualTo(author.getStudentId());
                    assertThat(snapshot.getAuthorName()).isEqualTo(author.getName());
                    assertThat(snapshot.getDeletedByStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(snapshot.getDeletedByName()).isEqualTo(admin.getName());
                    assertThat(snapshot.getDeletedByRole()).isEqualTo(Member.Role.ADMIN.name());
                    assertThat(snapshot.getDeletionReason()).isEqualTo("운영 규칙 위반");
                });
    }

    @Test
    void adminDeletingAnotherMembersPostRequiresReason() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사유 필수 대상", "본문", "GENERAL", false),
                null
        );

        assertThatThrownBy(() -> communityService.delete(admin.getStudentId(), created.id(), " "))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        assertThat(communityPostRepository.findById(created.id())).isPresent();
        assertThat(deletedCommunityPostRepository.findAll()).isEmpty();
    }

    @Test
    void deletionAuditLogContentSnapshotCannotInjectExtraAuditLines() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("본문 줄바꿈", "첫 줄\ndeletedBy=가짜 관리자\n둘째 줄", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "본문 검증");

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_DELETE"))
                .singleElement()
                .satisfies(log -> assertThat(log.getDetail())
                        .contains("content=첫 줄 deletedBy=가짜 관리자 둘째 줄")
                        .doesNotContain("\ndeletedBy=가짜 관리자"));
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

    @Test
    void adminCommentDeletionAuditLogKeepsCommentAndModeratorSnapshot() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member commenter = member("2025222222", "댓글러", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(commenter);
        memberRepository.save(admin);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("댓글 감사 대상", "본문", "GENERAL", false),
                null
        );
        var comment = communityService.addComment(
                post.id(),
                commenter.getStudentId(),
                new CommunityCommentRequest("삭제될 댓글 내용입니다.", null)
        );
        auditLogRepository.deleteAll();

        communityService.deleteComment(post.id(), comment.id(), admin.getStudentId());

        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_COMMENT_DELETE"))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getActorStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(log.getActorName()).isEqualTo(admin.getName());
                    assertThat(log.getTargetType()).isEqualTo("COMMUNITY_COMMENT");
                    assertThat(log.getTargetId()).isEqualTo(String.valueOf(comment.id()));
                    assertThat(log.getDetail()).contains(
                            "postId=" + post.id(),
                            "title=댓글 감사 대상",
                            "author=댓글러(2025222222)",
                            "deletedBy=관리자(2026123456)",
                            "deletedByRole=ADMIN",
                            "content=삭제될 댓글 내용입니다."
                    );
                });
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
