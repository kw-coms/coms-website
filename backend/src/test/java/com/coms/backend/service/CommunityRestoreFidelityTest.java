package com.coms.backend.service;

import com.coms.backend.domain.CommunityPollVote;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostVote;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostBookmarkRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.DeletedCommunityPostAppealRepository;
import com.coms.backend.repository.DeletedCommunityPostCommentRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.RecordComponent;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/**
 * Two things a community post must not lose: a display name 회장 typed in for it, and — when a
 * deleted post is restored — everything it had before the deletion. Not {@code @Transactional}:
 * the delete and the restore each have to commit for the snapshot to be read back.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-restore-fidelity-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/community-restore-fidelity"
})
@WithMockUser(roles = "ADMIN")
class CommunityRestoreFidelityTest {

    private static final String AUTHOR = "2025123456";
    private static final String VOTER_A = "2026111111";
    private static final String VOTER_B = "2026222222";
    private static final String VOTER_C = "2026333333";
    private static final String ADMIN = "2024999999";
    private static final String POLL_ID = "poll-restore-1";
    private static final String POLL_BODY = """
            [{"type":"text","content":"복원 대상 본문"},
             {"type":"poll","pollId":"%s","question":"어느 쪽?","options":[{"label":"가"},{"label":"나"}]}]
            """.formatted(POLL_ID);

    @Autowired private CommunityService communityService;
    @Autowired private CommunityDeletionArchiveService archiveService;
    @Autowired private MemberRepository memberRepository;
    @Autowired private CommunityPostRepository postRepository;
    @Autowired private CommunityPostVoteRepository voteRepository;
    @Autowired private CommunityPostBookmarkRepository bookmarkRepository;
    @Autowired private CommunityPollVoteRepository pollVoteRepository;
    @Autowired private CommunityCommentRepository commentRepository;
    @Autowired private DeletedCommunityPostRepository deletedPostRepository;
    @Autowired private DeletedCommunityPostCommentRepository deletedCommentRepository;
    @Autowired private DeletedCommunityPostAppealRepository deletedAppealRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AuditLogRepository auditLogRepository;

    @BeforeEach
    void seed() {
        clean();
        memberRepository.save(member(AUTHOR, "작성자", Member.Role.USER));
        memberRepository.save(member(VOTER_A, "투표자A", Member.Role.USER));
        memberRepository.save(member(VOTER_B, "투표자B", Member.Role.USER));
        memberRepository.save(member(VOTER_C, "투표자C", Member.Role.USER));
        memberRepository.save(member(ADMIN, "회장", Member.Role.ADMIN));
    }

    @AfterEach
    void clean() {
        notificationRepository.deleteAll();
        deletedAppealRepository.deleteAll();
        deletedCommentRepository.deleteAll();
        deletedPostRepository.deleteAll();
        auditLogRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        bookmarkRepository.deleteAll();
        voteRepository.deleteAll();
        postRepository.deleteAll();
        memberRepository.deleteAll();
    }

    // ---- 작성자 이름만 변경 ---------------------------------------------------------------------

    @Test
    void nameOnlyOverrideIsShownAsWrittenAndSurvivesTheAuthorsEdits() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("세미나 후기", "본문", "GENERAL", false), null).id();
        assertThat(communityService.get(VOTER_A, id).authorDisplayName()).isEqualTo("59기 작성자");

        CommunityPostResponse changed = communityService.updateAuthor(ADMIN, id, null, "  외부 연사 김OO ");

        // The name used to be stored and then ignored: every response kept showing "작성자".
        assertThat(changed.authorName()).isEqualTo("외부 연사 김OO");
        assertThat(changed.authorDisplayName()).isEqualTo("외부 연사 김OO");
        assertThat(changed.authorNameOverridden()).isTrue();
        assertThat(changed.authorStudentId()).isEqualTo(AUTHOR);
        assertThat(communityService.get(VOTER_A, id).authorDisplayName()).isEqualTo("외부 연사 김OO");
        assertThat(communityService.list(VOTER_A)).singleElement()
                .satisfies(row -> assertThat(row.authorDisplayName()).isEqualTo("외부 연사 김OO"));

        communityService.update(AUTHOR, id, new CommunityPostRequest("세미나 후기 (수정)", "고친 본문", "GENERAL", false), null);

        assertThat(communityService.get(VOTER_A, id).authorName()).isEqualTo("외부 연사 김OO");
    }

    @Test
    void reassigningThePostToAMemberEndsTheOverride() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("대리 작성", "본문", "GENERAL", false), null).id();
        communityService.updateAuthor(ADMIN, id, null, "임시 이름");

        CommunityPostResponse reassigned = communityService.updateAuthor(ADMIN, id, VOTER_A, null);

        assertThat(reassigned.authorStudentId()).isEqualTo(VOTER_A);
        assertThat(reassigned.authorName()).isEqualTo("투표자A");
        assertThat(reassigned.authorDisplayName()).isEqualTo("60기 투표자A");
        assertThat(reassigned.authorNameOverridden()).isFalse();
        assertThat(postRepository.findById(id).orElseThrow().isAuthorNameOverridden()).isFalse();
    }

    @Test
    void aTypedInNameDoesNotCarryTheLinkedAccountsBadges() {
        Long id = communityService.create(ADMIN, new CommunityPostRequest("대신 올림", "본문", "GENERAL", false), null).id();
        CommunityPostResponse own = communityService.get(VOTER_A, id);
        assertThat(own.authorAdmin()).isTrue();
        assertThat(own.authorRole()).isEqualTo("ADMIN");

        communityService.updateAuthor(ADMIN, id, null, "졸업생 박OO");

        // Otherwise the post read "졸업생 박OO [회장]": the badge belongs to the account, not the name.
        CommunityPostResponse shown = communityService.get(VOTER_A, id);
        assertThat(shown.authorDisplayName()).isEqualTo("졸업생 박OO");
        assertThat(shown.authorAdmin()).isFalse();
        assertThat(shown.authorRole()).isNull();
        assertThat(shown.authorTier()).isNull();
        // Ownership is unchanged: the account can still edit its post.
        assertThat(communityService.get(ADMIN, id).editable()).isTrue();
        assertThat(communityService.listByAuthor(ADMIN, VOTER_A)).singleElement()
                .satisfies(row -> assertThat(row.authorNameOverridden()).isTrue());
    }

    @Test
    void anOverrideNeverUnmasksOrRelabelsAnAnonymousPost() {
        Long id = communityService.create(AUTHOR,
                new CommunityPostRequest("익명 글", "본문", "ANONYMOUS", false, "반고닉"), null, "118.235.10.20").id();
        String shownBefore = communityService.get(VOTER_A, id).authorDisplayName();

        communityService.updateAuthor(ADMIN, id, null, "실명 노출 금지");

        CommunityPostResponse seenByMember = communityService.get(VOTER_A, id);
        assertThat(seenByMember.authorDisplayName()).isEqualTo(shownBefore);
        assertThat(seenByMember.authorName()).isEqualTo(shownBefore);
        assertThat(seenByMember.authorNameOverridden()).isFalse();
        assertThat(seenByMember.authorStudentId()).isNull();
    }

    // ---- 삭제 → 복원 ---------------------------------------------------------------------------

    @Test
    void restoreBringsBackTheAnonymousIdentityThePinAndEveryReaction() {
        Long id = communityService.create(AUTHOR,
                new CommunityPostRequest("익명 투표 글", POLL_BODY, "ANONYMOUS", false, "반고닉"), null, "118.235.10.20").id();
        communityService.setPinned(ADMIN, id, true);
        communityService.vote(VOTER_A, id, 1);
        communityService.vote(VOTER_B, id, 1);
        communityService.vote(VOTER_C, id, -1);
        communityService.toggleBookmark(id, VOTER_A);
        communityService.toggleBookmark(id, VOTER_C);
        communityService.votePoll(VOTER_A, id, new CommunityPollVoteRequest(POLL_ID, 0));
        communityService.votePoll(VOTER_B, id, new CommunityPollVoteRequest(POLL_ID, 1));
        communityService.addComment(id, VOTER_A, new CommunityCommentRequest("익명 댓글", null), "10.0.0.7");
        CommunityPost original = postRepository.findById(id).orElseThrow();
        LocalDateTime bookmarkedAt = bookmarkRepository.findByPostId(id).stream()
                .filter(bookmark -> bookmark.getStudentId().equals(VOTER_A))
                .findFirst().orElseThrow().getCreatedAt();

        communityService.delete(ADMIN, id, "운영 방침 확인");

        assertThat(voteRepository.count()).isZero();
        assertThat(bookmarkRepository.count()).isZero();
        assertThat(pollVoteRepository.count()).isZero();
        Long snapshotId = deletedPostRepository.findAll().get(0).getId();

        Long restoredId = archiveService.restore(snapshotId, ADMIN).restoredPostId();

        CommunityPost restored = postRepository.findById(restoredId).orElseThrow();
        assertThat(restored.getCategory()).isEqualTo(CommunityPost.Category.ANONYMOUS);
        assertThat(restored.getAnonymousName()).isEqualTo("반고닉").isEqualTo(original.getAnonymousName());
        assertThat(restored.getIpAddress()).isNotBlank().isEqualTo(original.getIpAddress());
        assertThat(restored.isPinned()).isTrue();
        assertThat(restored.getPinnedAt()).isCloseTo(original.getPinnedAt(), within(1, ChronoUnit.MILLIS));

        assertThat(voteRepository.findByPostIdIn(List.of(restoredId)))
                .extracting(CommunityPostVote::getStudentId, CommunityPostVote::getValue)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(VOTER_A, 1),
                        org.assertj.core.groups.Tuple.tuple(VOTER_B, 1),
                        org.assertj.core.groups.Tuple.tuple(VOTER_C, -1));
        assertThat(bookmarkRepository.findByPostId(restoredId))
                .extracting("studentId").containsExactlyInAnyOrder(VOTER_A, VOTER_C);
        assertThat(bookmarkRepository.findByPostId(restoredId).stream()
                .filter(bookmark -> bookmark.getStudentId().equals(VOTER_A))
                .findFirst().orElseThrow().getCreatedAt())
                .isCloseTo(bookmarkedAt, within(1, ChronoUnit.MILLIS));
        assertThat(pollVoteRepository.findByPostIdIn(List.of(restoredId)))
                .extracting(CommunityPollVote::getStudentId, CommunityPollVote::getOptionIndex)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(VOTER_A, 0),
                        org.assertj.core.groups.Tuple.tuple(VOTER_B, 1));

        // …and members see it the way they left it.
        CommunityPostResponse seenByA = communityService.get(VOTER_A, restoredId);
        assertThat(seenByA.upvotes()).isEqualTo(2);
        assertThat(seenByA.downvotes()).isEqualTo(1);
        assertThat(seenByA.myVote()).isEqualTo(1);
        assertThat(seenByA.bookmarked()).isTrue();
        assertThat(seenByA.pinned()).isTrue();
        assertThat(seenByA.pollResults()).singleElement().satisfies(poll -> {
            assertThat(poll.optionCounts()).containsExactly(1L, 1L);
            assertThat(poll.myOption()).isEqualTo(0);
        });
        assertThat(communityService.listBookmarked(VOTER_C)).extracting(CommunityPostResponse::id).containsExactly(restoredId);
        assertThat(communityService.listComments(restoredId, VOTER_B)).hasSize(1);
    }

    @Test
    void restoreKeepsANameOverride() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("대리 게시", "본문", "GENERAL", false), null).id();
        communityService.updateAuthor(ADMIN, id, null, "졸업생 박OO");
        communityService.delete(ADMIN, id, "잘못 삭제");

        Long restoredId = archiveService.restore(deletedPostRepository.findAll().get(0).getId(), ADMIN).restoredPostId();

        assertThat(communityService.get(VOTER_A, restoredId).authorDisplayName()).isEqualTo("졸업생 박OO");
    }

    @Test
    void aMemberWhoLeftOrWhoseStudentIdWasReissuedGetsNothingBack() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("탈퇴자 반응", POLL_BODY, "GENERAL", false), null).id();
        communityService.vote(VOTER_A, id, 1);
        communityService.vote(VOTER_B, id, 1);
        communityService.vote(VOTER_C, id, 1);
        communityService.toggleBookmark(id, VOTER_B);
        communityService.votePoll(VOTER_C, id, new CommunityPollVoteRequest(POLL_ID, 1));
        communityService.delete(ADMIN, id, "정리");

        // VOTER_B leaves for good; VOTER_C's 학번 is later issued to a new account.
        memberRepository.delete(memberRepository.findByStudentId(VOTER_B).orElseThrow());
        memberRepository.delete(memberRepository.findByStudentId(VOTER_C).orElseThrow());
        Member reissued = member(VOTER_C, "새 회원", Member.Role.USER);
        ReflectionTestUtils.setField(reissued, "createdAt", LocalDateTime.now().plusMinutes(5));
        memberRepository.save(reissued);

        Long restoredId = archiveService.restore(deletedPostRepository.findAll().get(0).getId(), ADMIN).restoredPostId();

        assertThat(voteRepository.findByPostIdIn(List.of(restoredId)))
                .extracting(CommunityPostVote::getStudentId).containsExactly(VOTER_A);
        assertThat(bookmarkRepository.findByPostId(restoredId)).isEmpty();
        assertThat(pollVoteRepository.findByPostIdIn(List.of(restoredId))).isEmpty();
    }

    @Test
    void aSnapshotTakenBeforeTheExtraStateExistedRestoresAsItAlwaysDid() {
        Long id = communityService.create(AUTHOR,
                new CommunityPostRequest("옛 삭제 기록", POLL_BODY, "ANONYMOUS", false, "옛닉"), null, "118.235.10.20").id();
        communityService.vote(VOTER_A, id, 1);
        communityService.addComment(id, VOTER_A, new CommunityCommentRequest("댓글", null));
        communityService.delete(ADMIN, id, "정리");
        DeletedCommunityPost snapshot = deletedPostRepository.findAll().get(0);
        snapshot.setRestoreState(null);
        deletedPostRepository.save(snapshot);

        Long restoredId = archiveService.restore(snapshot.getId(), ADMIN).restoredPostId();

        CommunityPost restored = postRepository.findById(restoredId).orElseThrow();
        assertThat(restored.getTitle()).isEqualTo("옛 삭제 기록");
        assertThat(restored.getAnonymousName()).isNull();
        assertThat(restored.isPinned()).isFalse();
        assertThat(voteRepository.findByPostIdIn(List.of(restoredId))).isEmpty();
        assertThat(commentRepository.findByPostIdOrderByCreatedAtAsc(restoredId)).hasSize(1);
    }

    @Test
    void anUnreadableOrTamperedStateNeverBlocksARestore() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("손상된 기록", POLL_BODY, "GENERAL", false), null).id();
        communityService.delete(ADMIN, id, "정리");
        DeletedCommunityPost snapshot = deletedPostRepository.findAll().get(0);
        // Unknown poll, out-of-range option, a vote value that was never valid, a stranger, a duplicate.
        snapshot.setRestoreState("""
                {"version":1,"pinned":false,"authorNameOverridden":false,
                 "votes":[{"studentId":"%1$s","value":7},{"studentId":"%1$s","value":1},{"studentId":"%1$s","value":1},
                          {"studentId":"1999000000","value":1}],
                 "bookmarks":[{"studentId":"1999000000"}],
                 "pollVotes":[{"pollId":"no-such-poll","studentId":"%1$s","optionIndex":0},
                              {"pollId":"%2$s","studentId":"%1$s","optionIndex":9}]}
                """.formatted(VOTER_A, POLL_ID));
        deletedPostRepository.save(snapshot);

        Long restoredId = archiveService.restore(snapshot.getId(), ADMIN).restoredPostId();

        assertThat(voteRepository.findByPostIdIn(List.of(restoredId)))
                .extracting(CommunityPostVote::getStudentId, CommunityPostVote::getValue)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(VOTER_A, 1));
        assertThat(bookmarkRepository.findByPostId(restoredId)).isEmpty();
        assertThat(pollVoteRepository.findByPostIdIn(List.of(restoredId))).isEmpty();

        Long secondId = communityService.create(AUTHOR, new CommunityPostRequest("깨진 기록", "본문", "GENERAL", false), null).id();
        communityService.delete(ADMIN, secondId, "정리");
        DeletedCommunityPost broken = deletedPostRepository.findAll().stream()
                .filter(candidate -> candidate.getOriginalPostId().equals(secondId)).findFirst().orElseThrow();
        broken.setRestoreState("{not json");
        deletedPostRepository.save(broken);

        assertThat(archiveService.restore(broken.getId(), ADMIN).restoredPostId()).isNotNull();
    }

    @Test
    void aSnapshotIsRestoredOnlyOnce() {
        Long id = communityService.create(AUTHOR, new CommunityPostRequest("한 번만", "본문", "GENERAL", false), null).id();
        communityService.delete(ADMIN, id, "정리");
        Long snapshotId = deletedPostRepository.findAll().get(0).getId();
        archiveService.restore(snapshotId, ADMIN);

        assertThatThrownBy(() -> archiveService.restore(snapshotId, ADMIN))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThat(postRepository.count()).isEqualTo(1);
    }

    @Test
    void whoReactedIsNeverPartOfAnArchiveResponse() {
        Long id = communityService.create(AUTHOR,
                new CommunityPostRequest("비공개 확인", POLL_BODY, "ANONYMOUS", false, "반고닉"), null, "118.235.10.20").id();
        communityService.vote(VOTER_A, id, 1);
        communityService.toggleBookmark(id, VOTER_B);
        communityService.votePoll(VOTER_C, id, new CommunityPollVoteRequest(POLL_ID, 0));
        communityService.delete(AUTHOR, id);

        assertThat(deletedPostRepository.findAll().get(0).getRestoreState()).contains(VOTER_A, VOTER_B, VOTER_C);
        assertThat(Arrays.stream(DeletedCommunityPostResponse.class.getRecordComponents()).map(RecordComponent::getName))
                .doesNotContain("restoreState");
        // Record toString prints every component, nested ones included.
        for (DeletedCommunityPostResponse response : List.of(archiveService.recent(10).get(0), archiveService.mine(AUTHOR).get(0))) {
            assertThat(response.toString()).doesNotContain(VOTER_A, VOTER_B, VOTER_C, "118.235");
        }
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
