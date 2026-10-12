package com.coms.backend.config;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.DeletedCommunityPostAppeal;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.dto.DeletedCommunityPostAppealRequest;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.DeletedCommunityPostAppealRepository;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import com.coms.backend.service.AdminService;
import com.coms.backend.service.CommunityDeletionArchiveService;
import com.coms.backend.service.CommunityService;
import com.coms.backend.service.NoticeService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Boots the application the way production does — the {@code prod} profile, PostgreSQL, Flyway
 * building the schema from an empty database, and Hibernate {@code ddl-auto=validate} — and then
 * uses it.
 *
 * <p>Every other Spring test runs on H2 with Hibernate creating the tables from the entities, so
 * two kinds of mistakes had nowhere to show up before a deploy: an entity that disagrees with the
 * migrations (the server then refuses to start), and code that the real schema's constraints
 * reject. The second kind already happened: deleting a post whose comments had replies worked on
 * H2 and failed on the production foreign keys.
 *
 * <p>Skipped unless {@code COMS_PG_TEST_URL} is set; CI sets it and fails if this class is skipped.
 */
@EnabledIfEnvironmentVariable(named = "COMS_PG_TEST_URL", matches = ".+")
@ActiveProfiles("prod")
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        // The prod profile turns the catalogue link check on; a test makes no outside requests.
        "coms.project-links.enabled=false",
        "storage.location=./build/test-uploads/postgres-production-schema"
})
@WithMockUser(roles = "ADMIN")
class PostgresProductionSchemaTest {

    private static final String POLL_ID = "poll-pg-1";
    private static final String POLL_BODY = """
            [{"type":"text","content":"실제 스키마에서 도는 글"},
             {"type":"poll","pollId":"%s","question":"어느 쪽?","options":[{"label":"가"},{"label":"나"}]}]
            """.formatted(POLL_ID);

    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        String url = System.getenv("COMS_PG_TEST_URL");
        String user = System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres");
        String password = System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres");
        // Start from nothing, like a first deploy: the application's own Flyway then has to
        // build every table before Hibernate checks them.
        Flyway.configure().dataSource(url, user, password).cleanDisabled(false).load().clean();
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
    }

    @Autowired private Environment environment;
    @Autowired private Flyway flyway;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private MemberRepository memberRepository;
    @Autowired private CommunityService communityService;
    @Autowired private CommunityDeletionArchiveService archiveService;
    @Autowired private CommunityPostRepository postRepository;
    @Autowired private CommunityCommentRepository commentRepository;
    @Autowired private DeletedCommunityPostRepository deletedPostRepository;
    @Autowired private DeletedCommunityPostAppealRepository appealRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private NoticeService noticeService;
    @Autowired private AdminService adminService;

    @Test
    void theApplicationStartsOnAFlywayBuiltSchemaWithValidation() {
        assertThat(environment.getActiveProfiles()).containsExactly("prod");
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(jdbc.queryForObject("SELECT version()", String.class)).startsWith("PostgreSQL");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.info().applied().length).isGreaterThan(90);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE NOT success", Integer.class)).isZero();
    }

    @Test
    void aCommunityPostLivesItsWholeLifeOnTheRealSchema() {
        String author = "2025100001";
        String memberA = "2026100002";
        String memberB = "2026100003";
        String admin = "2024100009";
        memberRepository.save(member(author, "작성자", Member.Role.USER));
        memberRepository.save(member(memberA, "회원A", Member.Role.USER));
        memberRepository.save(member(memberB, "회원B", Member.Role.USER));
        memberRepository.save(member(admin, "회장", Member.Role.ADMIN));

        Long id = communityService.create(author,
                new CommunityPostRequest("실제 스키마 점검", POLL_BODY, "ANONYMOUS", false, "반고닉"), null, "118.235.10.20").id();
        communityService.setPinned(admin, id, true);
        communityService.vote(memberA, id, 1);
        communityService.vote(memberB, id, -1);
        communityService.toggleBookmark(id, memberA);
        communityService.votePoll(memberA, id, new CommunityPollVoteRequest(POLL_ID, 0));
        communityService.votePoll(memberB, id, new CommunityPollVoteRequest(POLL_ID, 1));
        Long comment = communityService.addComment(id, memberA, new CommunityCommentRequest("첫 댓글", null), "10.0.0.7").id();
        Long reply = communityService.addComment(id, author, new CommunityCommentRequest("답글", comment), "118.235.10.20").id();
        communityService.addComment(id, memberA, new CommunityCommentRequest("답글의 답글", reply), "10.0.0.7");
        communityService.update(author, id, new CommunityPostRequest("실제 스키마 점검", POLL_BODY, "ANONYMOUS", false, "반고닉"), null);

        // The post's author is told about the comment without being told who wrote it.
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author))
                .filteredOn(notification -> notification.getType() == Notification.Type.COMMENT_ON_POST)
                .isNotEmpty()
                .allSatisfy(notification -> {
                    assertThat(notification.getActorStudentId()).isNull();
                    assertThat(notification.getMessage()).isEqualTo("내 익명 글에 새 댓글이 달렸습니다.");
                });
        assertThat(communityService.listPaged(memberB, 0, 20).items()).extracting(CommunityPostResponse::id).contains(id);
        assertThat(communityService.searchPaged(memberB, "스키마", 0, 20).items()).extracting(CommunityPostResponse::id).contains(id);
        assertThat(communityService.listBookmarked(memberA)).extracting(CommunityPostResponse::id).contains(id);
        assertThat(communityService.reputation(memberB, memberA)).isNotNull();

        // Comments with replies: the production foreign keys used to reject this delete.
        communityService.delete(admin, id, "운영 방침 확인");

        assertThat(postRepository.findById(id)).isEmpty();
        assertThat(commentRepository.findByPostIdOrderByCreatedAtAsc(id)).isEmpty();
        Long snapshotId = deletedPostRepository.findByAuthorStudentIdOrderByDeletedAtDesc(author).get(0).getId();
        assertThat(archiveService.mine(author)).hasSize(1);
        assertThat(archiveService.recent(10)).isNotEmpty();
        archiveService.requestRestore(snapshotId, author, new DeletedCommunityPostAppealRequest("복원을 요청합니다."));

        Long restoredId = archiveService.restore(snapshotId, admin).restoredPostId();

        CommunityPost restored = postRepository.findById(restoredId).orElseThrow();
        assertThat(restored.getAnonymousName()).isEqualTo("반고닉");
        assertThat(restored.isPinned()).isTrue();
        CommunityPostResponse seenByA = communityService.get(memberA, restoredId);
        assertThat(seenByA.upvotes()).isEqualTo(1);
        assertThat(seenByA.downvotes()).isEqualTo(1);
        assertThat(seenByA.myVote()).isEqualTo(1);
        assertThat(seenByA.bookmarked()).isTrue();
        assertThat(seenByA.pollResults()).singleElement()
                .satisfies(poll -> assertThat(poll.optionCounts()).containsExactly(1L, 1L));
        assertThat(communityService.listComments(restoredId, memberB)).hasSize(3);
        assertThat(appealRepository.findByDeletedPostIdAndStatus(snapshotId, DeletedCommunityPostAppeal.Status.OPEN)).isEmpty();

        // The display-name override writes the column V94 adds.
        assertThat(communityService.updateAuthor(admin, restoredId, null, "표시 이름").editable()).isTrue();
        assertThat(postRepository.findById(restoredId).orElseThrow().isAuthorNameOverridden()).isTrue();

        // Removing a member walks every table that is keyed by 학번.
        adminService.deleteByStudentId(memberA);

        assertThat(memberRepository.findByStudentId(memberA)).isEmpty();
        assertThat(communityService.get(memberB, restoredId).upvotes()).isZero();
        communityService.delete(author, restoredId);
        assertThat(postRepository.findById(restoredId)).isEmpty();
    }

    @Test
    void readingANoticeCountsTheViewWithoutTouchingTheRow() throws InterruptedException {
        String writer = "2024100010";
        String reader = "2026100011";
        memberRepository.save(member(writer, "공지 작성자", Member.Role.ADMIN));
        memberRepository.save(member(reader, "독자", Member.Role.USER));
        NoticeResponse created = noticeService.create(writer, new NoticeRequest("실제 스키마 공지", "<p>내용</p>", null, false, "GENERAL"));
        // As stored (the database keeps microseconds), and late enough that a touch would show.
        LocalDateTime storedUpdatedAt = noticeService.get(created.id()).updatedAt();
        Thread.sleep(20);

        noticeService.getAndIncrementView(created.id(), reader);
        NoticeResponse read = noticeService.getAndIncrementView(created.id(), reader);

        assertThat(read.viewCount()).isEqualTo(2);
        assertThat(read.updatedAt()).isEqualTo(storedUpdatedAt);
        assertThat(noticeService.vote(reader, created.id(), 1).upvotes()).isEqualTo(1);
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(reader))
                .extracting(Notification::getType).contains(Notification.Type.NOTICE_CREATED);
        assertThat(noticeService.listPaged(reader, 0, 10).items()).extracting(NoticeResponse::id).contains(created.id());
    }

    private static Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded-password");
        member.setRole(role);
        return member;
    }
}
