package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.DeletedCommunityPostAppealRepository;
import com.coms.backend.repository.DeletedCommunityPostCommentRepository;
import com.coms.backend.repository.DeletedCommunityPostImageRepository;
import com.coms.backend.repository.DeletedCommunityPostMediaRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Regression tests for what the anonymous board promises (nobody learns who wrote what) and for
 * post data that must survive edits and deletes intact. Not {@code @Transactional}: several of
 * these only fail once a transaction really commits.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-privacy-integrity-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/community-privacy-integrity"
})
@WithMockUser(roles = "ADMIN")
class CommunityPrivacyAndIntegrityTest {

    private static final String AUTHOR = "2025123456";
    private static final String COMMENTER = "2026123456";
    private static final String OTHER = "2026222222";
    private static final String MODERATOR = "2024555555";
    private static final String ADMIN = "2026129999";

    @Autowired private CommunityService communityService;
    @Autowired private CommunityDeletionArchiveService deletionArchiveService;
    @Autowired private NotificationService notificationService;
    @Autowired private MemberRepository memberRepository;
    @Autowired private CommunityPostRepository postRepository;
    @Autowired private CommunityCommentRepository commentRepository;
    @Autowired private CommunityPostVoteRepository voteRepository;
    @Autowired private CommunityPollVoteRepository pollVoteRepository;
    @Autowired private CommunityPostImageRepository imageRepository;
    @Autowired private CommunityPostVideoRepository videoRepository;
    @Autowired private CommunityPostFileRepository fileRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private DeletedCommunityPostRepository deletedPostRepository;
    @Autowired private DeletedCommunityPostImageRepository deletedImageRepository;
    @Autowired private DeletedCommunityPostMediaRepository deletedMediaRepository;
    @Autowired private DeletedCommunityPostCommentRepository deletedCommentRepository;
    @Autowired private DeletedCommunityPostAppealRepository deletedAppealRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        clean();
        memberRepository.save(member(AUTHOR, "글쓴이", Member.Role.USER));
        memberRepository.save(member(COMMENTER, "댓글러", Member.Role.USER));
        memberRepository.save(member(OTHER, "구경꾼", Member.Role.USER));
        memberRepository.save(member(MODERATOR, "부회장", Member.Role.VICE_PRESIDENT));
        memberRepository.save(member(ADMIN, "회장", Member.Role.ADMIN));
    }

    @AfterEach
    void clean() {
        jdbcTemplate.execute("ALTER TABLE community_comments DROP CONSTRAINT IF EXISTS fk_test_comments_parent");
        notificationRepository.deleteAll();
        deletedAppealRepository.deleteAll();
        deletedCommentRepository.deleteAll();
        deletedMediaRepository.deleteAll();
        deletedImageRepository.deleteAll();
        deletedPostRepository.deleteAll();
        auditLogRepository.deleteAll();
        fileRepository.deleteAll();
        videoRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        voteRepository.deleteAll();
        postRepository.deleteAll();
        memberRepository.deleteAll();
    }

    // ---- Anonymity -------------------------------------------------------------------------

    @Test
    void commentNotificationsOnAnonymousPostsDoNotNameTheCommenter() {
        var post = anonymousPost();

        var comment = communityService.addComment(post.id(), COMMENTER,
                new CommunityCommentRequest("댓글입니다", null, "ㅇㅇ"), "118.235.1.2");
        communityService.addComment(post.id(), AUTHOR,
                new CommunityCommentRequest("글쓴이의 답글", comment.id(), "ㅇㅇ"), "118.235.9.9");

        assertThat(notificationsFor(AUTHOR)).singleElement().satisfies(notification -> {
            assertThat(notification.getType()).isEqualTo(Notification.Type.COMMENT_ON_POST);
            assertThat(notification.getActorStudentId()).isNull();
            assertThat(notification.getMessage()).doesNotContain("댓글러").doesNotContain(COMMENTER);
        });
        // The reply notification must not reveal that the replier is the post's author either.
        assertThat(notificationsFor(COMMENTER)).singleElement().satisfies(notification -> {
            assertThat(notification.getType()).isEqualTo(Notification.Type.REPLY_ON_COMMENT);
            assertThat(notification.getActorStudentId()).isNull();
            assertThat(notification.getMessage()).doesNotContain("글쓴이").doesNotContain(AUTHOR);
        });
        assertThat(notificationService.list(AUTHOR)).singleElement().satisfies(response -> {
            assertThat(response.actorStudentId()).isNull();
            assertThat(response.message()).doesNotContain("댓글러");
        });
    }

    @Test
    void commentNotificationsOnNamedBoardsStillSayWhoCommented() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("공개 글", "내용", "GENERAL", false), null);

        communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("댓글", null));

        assertThat(notificationsFor(AUTHOR)).singleElement().satisfies(notification -> {
            assertThat(notification.getActorStudentId()).isEqualTo(COMMENTER);
            assertThat(notification.getMessage()).contains("댓글러");
        });
    }

    @Test
    void authorsDeletedRecordKeepsAnonymousCommentersAnonymous() {
        var post = anonymousPost();
        communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("익명 댓글", null, "지나가던"), "118.235.1.2");

        // Deleting your own anonymous post must not be a way to find out who commented on it.
        communityService.delete(AUTHOR, post.id());

        assertThat(deletionArchiveService.mine(AUTHOR)).singleElement().satisfies(record ->
                assertThat(record.commentInfos()).singleElement().satisfies(comment -> {
                    assertThat(comment.authorStudentId()).isNull();
                    assertThat(comment.authorName()).startsWith("지나가던").doesNotContain("댓글러");
                    assertThat(comment.content()).isEqualTo("익명 댓글");
                }));
        // Moderators reviewing the archive still see who wrote what.
        assertThat(deletionArchiveService.recent(10)).singleElement().satisfies(record ->
                assertThat(record.commentInfos()).singleElement().satisfies(comment -> {
                    assertThat(comment.authorStudentId()).isEqualTo(COMMENTER);
                    assertThat(comment.authorName()).isEqualTo("댓글러");
                }));
    }

    @Test
    void authorsDeletedRecordOfNamedPostOmitsCommenterStudentIds() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("공개 글", "내용", "GENERAL", false), null);
        communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("댓글", null));

        communityService.delete(AUTHOR, post.id());

        assertThat(deletionArchiveService.mine(AUTHOR)).singleElement().satisfies(record ->
                assertThat(record.commentInfos()).singleElement().satisfies(comment -> {
                    assertThat(comment.authorStudentId()).isNull();
                    assertThat(comment.authorName()).isEqualTo("댓글러");
                }));
    }

    @Test
    void postCannotBeMovedAcrossTheAnonymousBoundary() {
        var anonymous = anonymousPost();
        communityService.addComment(anonymous.id(), COMMENTER, new CommunityCommentRequest("익명 댓글", null, "ㅇㅇ"), "118.235.1.2");

        // Comment masking follows the post's category, so this edit used to unmask the commenter.
        assertThatThrownBy(() -> communityService.update(AUTHOR, anonymous.id(),
                new CommunityPostRequest("익명글", "내용", "GENERAL", false), null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> communityService.update(ADMIN, anonymous.id(),
                new CommunityPostRequest("익명글", "내용", "QUESTION", false), null))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(postRepository.findById(anonymous.id()).orElseThrow().getCategory())
                .isEqualTo(CommunityPost.Category.ANONYMOUS);
        assertThat(communityService.listComments(anonymous.id(), OTHER)).singleElement()
                .satisfies(comment -> assertThat(comment.authorName()).doesNotContain("댓글러"));

        var named = communityService.create(AUTHOR, new CommunityPostRequest("공개 글", "내용", "GENERAL", false), null);
        assertThatThrownBy(() -> communityService.update(AUTHOR, named.id(),
                new CommunityPostRequest("공개 글", "내용", "ANONYMOUS", false), null))
                .isInstanceOf(ResponseStatusException.class);
        // Moving between named boards, and editing an anonymous post in place, both still work.
        assertThat(communityService.update(AUTHOR, named.id(),
                new CommunityPostRequest("공개 글", "내용 수정", "QUESTION", false), null).category()).isEqualTo("QUESTION");
        assertThat(communityService.update(AUTHOR, anonymous.id(),
                new CommunityPostRequest("익명글 수정", "내용", "ANONYMOUS", false), null).title()).isEqualTo("익명글 수정");
    }

    @Test
    void reputationIgnoresActivityOnTheAnonymousBoard() {
        var named = communityService.create(AUTHOR, new CommunityPostRequest("공개 글", "내용", "GENERAL", false), null);
        communityService.addComment(named.id(), AUTHOR, new CommunityCommentRequest("공개 댓글", null));
        communityService.vote(COMMENTER, named.id(), 1);
        var before = communityService.reputation(OTHER, AUTHOR);

        // A counter that moves when someone posts anonymously tells everyone who posted.
        var anonymous = anonymousPost();
        communityService.addComment(anonymous.id(), AUTHOR, new CommunityCommentRequest("익명 댓글", null, "ㅇㅇ"), "118.235.1.2");
        communityService.vote(COMMENTER, anonymous.id(), 1);

        var after = communityService.reputation(OTHER, AUTHOR);
        assertThat(after.breakdown()).isEqualTo(before.breakdown());
        assertThat(after.score()).isEqualTo(before.score());
        assertThat(before.breakdown().posts()).isEqualTo(1);
        assertThat(before.breakdown().comments()).isEqualTo(1);
        assertThat(before.breakdown().upvotes()).isEqualTo(1);
        // The inline tier on lists is built from the same public numbers.
        assertThat(communityService.list(OTHER))
                .filteredOn(post -> post.id().equals(named.id()))
                .singleElement()
                .satisfies(post -> assertThat(post.authorTier()).isEqualTo("NEWCOMER"));
    }

    // ---- Post integrity ---------------------------------------------------------------------

    @Test
    void postWithRepliesCanBeDeletedWhenRepliesCascadeInTheDatabase() {
        // Production has ON DELETE CASCADE on parent_comment_id (migration V25); the entity mapping
        // does not, so recreate it here. Deleting a comment row then also removes its replies, and
        // a row-by-row delete fails on those replies with "row was already deleted".
        jdbcTemplate.execute("ALTER TABLE community_comments ADD CONSTRAINT fk_test_comments_parent "
                + "FOREIGN KEY (parent_comment_id) REFERENCES community_comments(id) ON DELETE CASCADE");
        var post = communityService.create(AUTHOR, new CommunityPostRequest("답글 있는 글", "내용", "GENERAL", false), null);
        var comment = communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("댓글", null));
        var reply = communityService.addComment(post.id(), AUTHOR, new CommunityCommentRequest("답글", comment.id()));
        communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("답글의 답글", reply.id()));

        communityService.delete(AUTHOR, post.id());

        assertThat(postRepository.findById(post.id())).isEmpty();
        assertThat(commentRepository.count()).isZero();
        assertThat(deletedCommentRepository.count()).isEqualTo(3);
    }

    @Test
    void editingPostDoesNotReopenClosedPollOrDropItsDeadline() {
        String content = "[{\"type\":\"text\",\"content\":\"투표해주세요\"},"
                + "{\"type\":\"poll\",\"pollId\":\"poll-closed1\",\"question\":\"점심\",\"options\":[\"A\",\"B\"]},"
                + "{\"type\":\"poll\",\"pollId\":\"poll-timed1\",\"question\":\"저녁\",\"options\":[\"C\",\"D\"],"
                + "\"closesAt\":\"2099-01-01T12:00\"}]";
        var post = communityService.create(AUTHOR, new CommunityPostRequest("투표", content, "GENERAL", false), null);
        communityService.closePoll(AUTHOR, post.id(), "poll-closed1");

        // What a client that does not round-trip closesAt/closedAt sends when fixing a typo.
        String edited = "[{\"type\":\"text\",\"content\":\"투표해 주세요\"},"
                + "{\"type\":\"poll\",\"pollId\":\"poll-closed1\",\"question\":\"점심\",\"options\":[\"A\",\"B\"]},"
                + "{\"type\":\"poll\",\"pollId\":\"poll-timed1\",\"question\":\"저녁\",\"options\":[\"C\",\"D\"]}]";
        CommunityPostResponse updated = communityService.update(AUTHOR, post.id(),
                new CommunityPostRequest("투표", edited, "GENERAL", false), null);

        assertThat(updated.pollResults()).hasSize(2);
        assertThat(pollResult(updated, "poll-closed1").closed()).isTrue();
        assertThat(pollResult(updated, "poll-closed1").closedAt()).isNotNull();
        assertThat(pollResult(updated, "poll-timed1").closesAt()).hasToString("2099-01-01T12:00");
        assertThatThrownBy(() -> communityService.votePoll(COMMENTER, post.id(), new CommunityPollVoteRequest("poll-closed1", 0)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getReason()).contains("종료"));
    }

    @Test
    void pollQuestionAndOptionsAreFrozenOnceSomeoneHasVoted() {
        String content = "[{\"type\":\"poll\",\"pollId\":\"poll-frozen1\",\"question\":\"회식 메뉴\",\"options\":[\"치킨\",\"피자\"]}]";
        var post = communityService.create(AUTHOR, new CommunityPostRequest("투표", content, "GENERAL", false), null);

        // Before any vote the author may still correct the poll.
        String corrected = "[{\"type\":\"poll\",\"pollId\":\"poll-frozen1\",\"question\":\"회식 메뉴는?\",\"options\":[\"치킨\",\"피자\"]}]";
        assertThat(communityService.update(AUTHOR, post.id(), new CommunityPostRequest("투표", corrected, "GENERAL", false), null)
                .content()).contains("회식 메뉴는?");

        communityService.votePoll(COMMENTER, post.id(), new CommunityPollVoteRequest("poll-frozen1", 0));

        // Tallies are stored by option position: swapping the labels would rewrite the vote.
        String swapped = "[{\"type\":\"poll\",\"pollId\":\"poll-frozen1\",\"question\":\"싫어하는 메뉴는?\",\"options\":[\"피자\",\"치킨\"]}]";
        var updated = communityService.update(AUTHOR, post.id(), new CommunityPostRequest("투표", swapped, "GENERAL", false), null);

        assertThat(updated.content()).contains("회식 메뉴는?").doesNotContain("싫어하는");
        assertThat(updated.content().indexOf("치킨")).isLessThan(updated.content().indexOf("피자"));
        assertThat(pollResult(updated, "poll-frozen1").optionCounts()).containsExactly(1L, 0L);
    }

    @Test
    void shareImageDoesNotFallBackToImageRemovedFromBlockContent() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("사진 글", "...", "GENERAL", false), null);
        Long imageId = communityService.addImages(AUTHOR, post.id(), List.of(
                new MockMultipartFile("images", "photo.png", "image/png", onePixelPng()))).getFirst();
        communityService.update(AUTHOR, post.id(), new CommunityPostRequest("사진 글",
                "[{\"type\":\"image\",\"mediaId\":" + imageId + ",\"name\":\"photo.png\"}]", "GENERAL", false), null);
        assertThat(communityService.sharePreview(post.id()).hasImage()).isTrue();

        // The author takes the photo out of the post. The row may still exist until the client
        // deletes it, but the public share endpoints must stop serving it immediately.
        communityService.update(AUTHOR, post.id(), new CommunityPostRequest("사진 글",
                "[{\"type\":\"text\",\"content\":\"사진은 내렸습니다\"}]", "GENERAL", false), null);

        assertThat(communityService.sharePreview(post.id()).hasImage()).isFalse();
        assertThatThrownBy(() -> communityService.loadShareImage(post.id()))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void attachedFileCanBeRemovedByItsAuthorOnly() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("첨부 글", "내용", "GENERAL", false), null);
        Long fileId = communityService.addFile(AUTHOR, post.id(),
                new MockMultipartFile("file", "자료.zip", "application/zip", new byte[]{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00}));

        assertThatThrownBy(() -> communityService.deleteFile(OTHER, post.id(), fileId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(fileRepository.findById(fileId)).isPresent();

        communityService.deleteFile(AUTHOR, post.id(), fileId);

        assertThat(fileRepository.findById(fileId)).isEmpty();
        // Freed slots count again toward the per-post cap.
        assertThat(fileRepository.findByPostIdOrderByPositionAsc(post.id())).isEmpty();
    }

    // ---- Comments --------------------------------------------------------------------------

    @Test
    void commentsAreRateLimitedPerMember() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("글", "내용", "GENERAL", false), null);
        for (int count = 0; count < 12; count++) {
            communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("댓글 " + count, null));
        }

        assertThatThrownBy(() -> communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("한 개 더", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        // Another member is unaffected.
        communityService.addComment(post.id(), OTHER, new CommunityCommentRequest("다른 회원 댓글", null));
    }

    @Test
    void replyChainsHaveDepthLimit() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("글", "내용", "GENERAL", false), null);
        Long parentId = null;
        // Alternate authors and age each row so the per-minute limit is not what stops the chain.
        for (int depth = 0; depth <= 30; depth++) {
            var comment = communityService.addComment(post.id(), depth % 2 == 0 ? COMMENTER : OTHER,
                    new CommunityCommentRequest("깊이 " + depth, parentId));
            jdbcTemplate.update("UPDATE community_comments SET created_at = DATEADD('MINUTE', -5, created_at) WHERE id = ?", comment.id());
            parentId = comment.id();
        }

        Long deepest = parentId;
        assertThatThrownBy(() -> communityService.addComment(post.id(), AUTHOR, new CommunityCommentRequest("너무 깊은 답글", deepest)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        // Deleting the root still removes the whole chain.
        Long rootId = commentRepository.findByPostIdOrderByCreatedAtAsc(post.id()).stream()
                .filter(comment -> comment.getParentCommentId() == null).findFirst().orElseThrow().getId();
        communityService.deleteComment(post.id(), rootId, ADMIN);
        assertThat(commentRepository.count()).isZero();
    }

    @Test
    void moderatorMayDeleteButNotRewriteAnotherMembersComment() {
        var post = communityService.create(AUTHOR, new CommunityPostRequest("글", "내용", "GENERAL", false), null);
        var comment = communityService.addComment(post.id(), COMMENTER, new CommunityCommentRequest("원문", null));

        // The edited text would still appear under the original author's name.
        assertThatThrownBy(() -> communityService.updateComment(post.id(), comment.id(), MODERATOR,
                new CommunityCommentRequest("부회장이 바꾼 글", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(commentRepository.findById(comment.id()).orElseThrow().getContent()).isEqualTo("원문");

        assertThat(communityService.updateComment(post.id(), comment.id(), COMMENTER,
                new CommunityCommentRequest("본인 수정", null)).content()).isEqualTo("본인 수정");
        communityService.deleteComment(post.id(), comment.id(), MODERATOR);
        assertThat(commentRepository.findById(comment.id())).isEmpty();
    }

    @Test
    void moderatorDeletionWithLongestAllowedReasonSucceeds() {
        var post = communityService.create(AUTHOR,
                new CommunityPostRequest("가".repeat(120), "내용", "GENERAL", false), null);

        // Name + 120-character title + 300-character reason overflowed notifications.message
        // (VARCHAR(300)); the failed insert rolled the deletion back and answered HTTP 500.
        communityService.delete(MODERATOR, post.id(), "사".repeat(300));

        assertThat(postRepository.findById(post.id())).isEmpty();
        assertThat(notificationsFor(AUTHOR)).singleElement().satisfies(notification -> {
            assertThat(notification.getMessage()).hasSizeLessThanOrEqualTo(300);
            assertThat(notification.getMessage()).contains("부회장");
        });
    }

    // ---- Helpers ---------------------------------------------------------------------------

    private CommunityPostResponse anonymousPost() {
        return communityService.create(AUTHOR,
                new CommunityPostRequest("익명글", "내용", "ANONYMOUS", false, "반고닉"), null, "118.235.10.20");
    }

    private List<Notification> notificationsFor(String studentId) {
        return notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(studentId);
    }

    private static CommunityPostResponse.PollResult pollResult(CommunityPostResponse post, String pollId) {
        return post.pollResults().stream().filter(result -> result.pollId().equals(pollId)).findFirst().orElseThrow();
    }

    private static byte[] onePixelPng() {
        try {
            var image = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(image, "png", out);
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded-password");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
