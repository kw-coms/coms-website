package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostBookmark;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.CommunityPollVoteRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostBookmarkRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class CommunityServiceTest {
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
    private CommunityPostFileRepository fileRepository;

    @MockitoSpyBean
    private CommunityPostBookmarkRepository bookmarkRepository;

    @BeforeEach
    void setUp() {
        fileRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        voteRepository.deleteAll();
        bookmarkRepository.deleteAll();
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void derivesGenerationDisplayNameFromStudentId() {
        assertThat(CommunityService.generationFromStudentId("2026123456")).isEqualTo("60기");
        assertThat(CommunityService.generationFromStudentId("2025123456")).isEqualTo("59기");
        assertThat(CommunityService.generationFromStudentId("2024123456")).isEqualTo("58기");
        assertThat(CommunityService.displayName("2026123456", "관리자")).isEqualTo("60기 관리자");
    }

    @Test
    void listsAuthorDisplayNameAndAdminMarker() {
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(admin);
        memberRepository.save(user);

        communityService.create(admin.getStudentId(), new CommunityPostRequest("공지", "관리자 글", "GENERAL", false), null);
        CommunityPost post = new CommunityPost();
        post.setTitle("질문");
        post.setContent("일반 회원 글");
        post.setAuthorStudentId(user.getStudentId());
        post.setAuthorName(user.getName());
        communityPostRepository.save(post);

        var posts = communityService.list(user.getStudentId());

        assertThat(posts)
                .extracting("authorDisplayName")
                .contains("60기 관리자", "59기 회원");
        assertThat(posts)
                .filteredOn(postResponse -> postResponse.authorDisplayName().equals("60기 관리자"))
                .singleElement()
                .satisfies(postResponse -> assertThat(postResponse.authorAdmin()).isTrue());
    }

    @Test
    void detailViewIncrementsViewCount() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("질문", "내용", "GENERAL", false), null);

        var detail = communityService.get(user.getStudentId(), created.id());

        assertThat(detail.viewCount()).isEqualTo(1);
        assertThat(communityPostRepository.findById(created.id()).orElseThrow().getViewCount()).isEqualTo(1);
        assertThat(communityPostRepository.findById(created.id()).orElseThrow().isEdited()).isFalse();
    }

    @Test
    void voteTogglesAndReplacesCurrentVote() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("질문", "내용", "GENERAL", false), null);

        var upvoted = communityService.vote(user.getStudentId(), created.id(), 1);
        var downvoted = communityService.vote(user.getStudentId(), created.id(), -1);
        var cleared = communityService.vote(user.getStudentId(), created.id(), -1);

        assertThat(upvoted.upvotes()).isEqualTo(1);
        assertThat(upvoted.downvotes()).isZero();
        assertThat(upvoted.myVote()).isEqualTo(1);
        assertThat(downvoted.upvotes()).isZero();
        assertThat(downvoted.downvotes()).isEqualTo(1);
        assertThat(downvoted.myVote()).isEqualTo(-1);
        assertThat(cleared.upvotes()).isZero();
        assertThat(cleared.downvotes()).isZero();
        assertThat(cleared.myVote()).isZero();
    }

    @Test
    void marksPostAsConceptPostAfterNetUpvotesReachThreshold() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        var created = communityService.create(author.getStudentId(), new CommunityPostRequest("개념 후보", "내용", "GENERAL", false), null);

        for (int i = 0; i < 5; i++) {
            Member voter = member(String.format("20261234%02d", i), "회원" + i, Member.Role.USER);
            memberRepository.save(voter);
            var voted = communityService.vote(voter.getStudentId(), created.id(), 1);
            assertThat(voted.conceptPost()).isEqualTo(i >= 4);
        }
    }

    @Test
    void updatesTitleAndMarksRealContentEdits() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "내용", "GENERAL", false), null);

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("바뀐제목", "내용 수정", "INFO", false),
                null
        );

        assertThat(updated.title()).isEqualTo("바뀐제목");
        assertThat(updated.content()).isEqualTo("내용 수정");
        assertThat(updated.edited()).isTrue();
    }

    @Test
    void adminEditingAnotherMembersPostKeepsOriginalAuthor() {
        Member author = member("2025123456", "원작성자", Member.Role.USER);
        Member admin = member("2026129999", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("원제목", "내용", "GENERAL", false),
                null
        );

        var updated = communityService.update(
                admin.getStudentId(),
                created.id(),
                new CommunityPostRequest("관리자가 고친 제목", "관리자가 고친 내용", "GENERAL", false),
                null
        );

        assertThat(updated.authorStudentId()).isEqualTo(author.getStudentId());
        assertThat(updated.authorName()).isEqualTo("원작성자");
        assertThat(updated.authorDisplayName()).isEqualTo("59기 원작성자");
        assertThat(updated.authorAdmin()).isFalse();
        CommunityPost persisted = communityPostRepository.findById(created.id()).orElseThrow();
        assertThat(persisted.getAuthorStudentId()).isEqualTo(author.getStudentId());
        assertThat(persisted.getAuthorName()).isEqualTo("원작성자");
    }

    @Test
    void editingAnonymousPostKeepsOriginalAnonymousIdentity() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member viewer = member("2026123456", "회원", Member.Role.USER);
        Member admin = member("2026129999", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(viewer);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("익명글", "내용", "ANONYMOUS", false, "반고닉"),
                null,
                "118.235.10.20"
        );
        String originalAnonDisplay = communityService.get(viewer.getStudentId(), created.id()).authorName();
        assertThat(originalAnonDisplay).isEqualTo("반고닉(1e83)");

        // Admin edits from a different network and sends no anonymousName — identity must not change.
        communityService.update(
                admin.getStudentId(),
                created.id(),
                new CommunityPostRequest("익명글", "관리자 수정", "ANONYMOUS", false, ""),
                null,
                "203.0.113.99"
        );

        var afterEdit = communityService.get(viewer.getStudentId(), created.id());
        assertThat(afterEdit.authorName()).isEqualTo(originalAnonDisplay);
        assertThat(afterEdit.anonymousName()).isEqualTo("반고닉");
        assertThat(afterEdit.authorStudentId()).isNull();
        CommunityPost persisted = communityPostRepository.findById(created.id()).orElseThrow();
        assertThat(persisted.getAuthorStudentId()).isEqualTo(author.getStudentId());
        assertThat(persisted.getAnonymousName()).isEqualTo("반고닉");
        assertThat(persisted.getIpAddress()).isEqualTo("118.235.10.20");
    }

    @Test
    void adminEditingAnotherMembersCommentKeepsOriginalAuthor() {
        Member author = member("2025123456", "댓글작성자", Member.Role.USER);
        Member admin = member("2026129999", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("글", "내용", "GENERAL", false), null);
        var comment = communityService.addComment(post.id(), author.getStudentId(), new CommunityCommentRequest("원문 댓글", null));

        var updated = communityService.updateComment(post.id(), comment.id(), admin.getStudentId(),
                new CommunityCommentRequest("관리자가 고친 댓글", null));

        assertThat(updated.content()).isEqualTo("관리자가 고친 댓글");
        assertThat(updated.authorName()).isEqualTo("59기 댓글작성자");
        assertThat(commentRepository.findById(comment.id()).orElseThrow().getStudentId()).isEqualTo(author.getStudentId());
        assertThat(commentRepository.findById(comment.id()).orElseThrow().getAuthorName()).isEqualTo("댓글작성자");
        assertThat(communityService.listComments(post.id(), author.getStudentId()))
                .singleElement()
                .extracting("authorName")
                .isEqualTo("59기 댓글작성자");
    }

    @Test
    void initialPlaceholderFinalizationDoesNotMarkEdited() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "...", "GENERAL", false), null);

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "업로드 완료 본문", "GENERAL", false),
                null
        );

        assertThat(updated.edited()).isFalse();
    }

    @Test
    void initialUploadFinalizationWithOriginalTextDoesNotMarkEdited() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "처음 내용", "GENERAL", false), null);

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "[{\"type\":\"text\",\"content\":\"처음 내용\"},{\"type\":\"image\",\"mediaId\":1,\"name\":\"image.webp\",\"width\":75,\"align\":\"left\"}]", "GENERAL", false),
                null
        );

        assertThat(updated.edited()).isFalse();
    }

    @Test
    void initialUploadFinalizationWithFormattedOriginalTextDoesNotMarkEdited() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "처음 내용", "GENERAL", false), null);

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "[{\"type\":\"text\",\"content\":\"<b>처음</b> 내용\"},{\"type\":\"image\",\"mediaId\":1,\"name\":\"image.webp\",\"width\":75,\"align\":\"left\"}]", "GENERAL", false),
                null
        );

        assertThat(updated.edited()).isFalse();
    }

    @Test
    void sanitizesForgedFormattedTextBlocksOnCreateAndUpdate() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        String forgedContent = "[{\"type\":\"text\",\"content\":\"<b>굵게</b><img src=x onerror=alert(1)><span style=\\\"color:#123456;background-image:url(javascript:alert(1))\\\">색</span><script>alert(1)</script>\"}]";

        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", forgedContent, "GENERAL", false), null);

        assertThat(created.content()).contains("<b>굵게</b>");
        assertThat(created.content()).contains("color:#123456");
        assertThat(created.content()).doesNotContain("<img");
        assertThat(created.content()).doesNotContain("onerror");
        assertThat(created.content()).doesNotContain("javascript:");
        assertThat(created.content()).doesNotContain("<script");

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "[{\"type\":\"text\",\"content\":\"<u>밑줄</u><svg/onload=alert(1)>\"}]", "GENERAL", false),
                null
        );

        assertThat(updated.content()).contains("<u>밑줄</u>");
        assertThat(updated.content()).doesNotContain("<svg");
        assertThat(updated.content()).doesNotContain("onload");
    }

    @Test
    void immediateDifferentContentUpdateStillMarksEdited() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "처음 내용", "GENERAL", false), null);

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "[{\"type\":\"text\",\"content\":\"바꾼 내용\"}]", "GENERAL", false),
                null
        );

        assertThat(updated.edited()).isTrue();
    }

    @Test
    void rejectsOversizedOrUnsafePostTextAndComments() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);

        assertThatThrownBy(() -> communityService.create(
                user.getStudentId(),
                new CommunityPostRequest("x".repeat(121), "내용", "GENERAL", false),
                null
        )).isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> communityService.create(
                user.getStudentId(),
                new CommunityPostRequest("제목", "<script>alert(1)</script>", "GENERAL", false),
                null
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getReason()).contains("보안"));

        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("댓글", "내용", "GENERAL", false), null);
        assertThatThrownBy(() -> communityService.addComment(
                created.id(),
                user.getStudentId(),
                new com.coms.backend.dto.CommunityCommentRequest("javascript:alert(1)", null)
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getReason()).contains("보안"));
    }

    @Test
    void rateLimitsCommunityPostCreationPerUserPerMinute() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);

        for (int i = 0; i < 5; i++) {
            communityService.create(user.getStudentId(), new CommunityPostRequest("제목" + i, "내용", "GENERAL", false), null);
        }

        assertThatThrownBy(() -> communityService.create(
                user.getStudentId(),
                new CommunityPostRequest("제목5", "내용", "GENERAL", false),
                null
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void supportsDeepCommentRepliesAndCommentCounts() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var post = communityService.create(user.getStudentId(), new CommunityPostRequest("댓글", "내용", "GENERAL", false), null);

        var root = communityService.addComment(post.id(), user.getStudentId(), new CommunityCommentRequest("첫 댓글", null));
        var reply = communityService.addComment(post.id(), user.getStudentId(), new CommunityCommentRequest("답글", root.id()));
        var deepReply = communityService.addComment(post.id(), user.getStudentId(), new CommunityCommentRequest("대대댓글", reply.id()));

        assertThat(root.authorName()).isEqualTo("59기 회원");
        assertThat(deepReply.depth()).isEqualTo(2);
        assertThat(deepReply.parentCommentId()).isEqualTo(reply.id());
        assertThat(communityService.listComments(post.id(), user.getStudentId()))
                .extracting("authorName")
                .containsOnly("59기 회원");
        assertThat(communityService.get(user.getStudentId(), post.id()).commentCount()).isEqualTo(3);
        assertThat(communityService.list(user.getStudentId()))
                .filteredOn(item -> item.id().equals(post.id()))
                .singleElement()
                .satisfies(item -> assertThat(item.commentCount()).isEqualTo(3));
    }

    @Test
    void updatesCommentContentAndMarksEdited() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var post = communityService.create(user.getStudentId(), new CommunityPostRequest("댓글", "내용", "GENERAL", false), null);
        var comment = communityService.addComment(post.id(), user.getStudentId(), new CommunityCommentRequest("원문", null));

        var updated = communityService.updateComment(post.id(), comment.id(), user.getStudentId(),
                new CommunityCommentRequest("수정된 댓글\n두번째 줄", null));

        assertThat(updated.content()).isEqualTo("수정된 댓글\n두번째 줄");
        assertThat(updated.edited()).isTrue();
        assertThat(updated.updatedAt()).isNotNull();
    }

    @Test
    void rejectsImageMutationByNonAuthor() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member other = member("2024123456", "다른회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(other);
        var created = communityService.create(author.getStudentId(), new CommunityPostRequest("이미지", "내용", "GENERAL", false), null);
        MockMultipartFile image = new MockMultipartFile("images", "ok.png", "image/png", "png".getBytes());

        assertThatThrownBy(() -> communityService.addImages(other.getStudentId(), created.id(), java.util.List.of(image)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void detailIncludesExtraImageUrls() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("이미지", "내용", "GENERAL", false), null);
        MockMultipartFile image = new MockMultipartFile("images", "ok.png", "image/png", "png".getBytes());

        communityService.addImages(user.getStudentId(), created.id(), java.util.List.of(image));

        CommunityPostResponse detail = communityService.get(user.getStudentId(), created.id());

        assertThat(detail.imageUrls())
                .singleElement()
                .asString()
                .startsWith("/api/community/posts/" + created.id() + "/images/");
    }

    @Test
    void shareImageUsesFirstImageBlockInVisiblePostOrder() throws Exception {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("이미지", "내용", "GENERAL", false), null);
        MockMultipartFile lowerImage = new MockMultipartFile("images", "lower.png", "image/png", "lower".getBytes());
        MockMultipartFile topImage = new MockMultipartFile("images", "top.png", "image/png", "top".getBytes());
        java.util.List<Long> imageIds = communityService.addImages(user.getStudentId(), created.id(), java.util.List.of(lowerImage, topImage));

        String content = """
                [{"type":"image","mediaId":%d,"name":"top.png","width":75,"align":"center"},
                 {"type":"text","content":"본문"},
                 {"type":"image","mediaId":%d,"name":"lower.png","width":75,"align":"center"}]
                """.formatted(imageIds.get(1), imageIds.get(0));
        communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("이미지", content, "GENERAL", false),
                null
        );

        var shareImage = communityService.loadShareImage(created.id());

        assertThat(shareImage.resource().getInputStream().readAllBytes()).isEqualTo("top".getBytes());
        assertThat(shareImage.originalName()).isEqualTo("top.png");
    }

    @Test
    void acceptsZipAttachmentsAndExposesDownloadUrl() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("첨부", "내용", "GENERAL", false), null);
        MockMultipartFile zip = new MockMultipartFile("file", "source.zip", "application/zip", "zip".getBytes());

        Long fileId = communityService.addFile(user.getStudentId(), created.id(), zip);
        CommunityPostResponse detail = communityService.get(user.getStudentId(), created.id());

        assertThat(fileId).isNotNull();
        assertThat(detail.fileInfos())
                .singleElement()
                .satisfies(file -> {
                    assertThat(file.originalName()).isEqualTo("source.zip");
                    assertThat(file.url()).isEqualTo("/api/community/posts/" + created.id() + "/files/" + fileId + "/download");
                });
    }

    @Test
    void rejectsNonZipCommunityAttachments() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("첨부", "내용", "GENERAL", false), null);
        MockMultipartFile text = new MockMultipartFile("file", "note.txt", "text/plain", "bad".getBytes());

        assertThatThrownBy(() -> communityService.addFile(user.getStudentId(), created.id(), text))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("ZIP"));
    }

    @Test
    void rejectsUnsupportedImageTypes() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        MockMultipartFile svg = new MockMultipartFile(
                "image",
                "bad.svg",
                "image/svg+xml",
                "<svg></svg>".getBytes()
        );

        assertThatThrownBy(() -> communityService.create(
                user.getStudentId(),
                new CommunityPostRequest("사진", "내용", "GENERAL", false),
                svg
        )).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void createsPostWithSelectedCategory() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);

        var created = communityService.create(
                user.getStudentId(),
                new CommunityPostRequest("질문", "내용", "QUESTION", false),
                null
        );

        assertThat(created.category()).isEqualTo("QUESTION");
        assertThat(communityPostRepository.findById(created.id()).orElseThrow().getCategory())
                .isEqualTo(CommunityPost.Category.QUESTION);
    }

    @Test
    void anonymousPostsAreHiddenFromGraduatesAndMaskedForMembers() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member viewer = member("2026123456", "회원", Member.Role.USER);
        Member graduate = member("2018123456", "졸업생", Member.Role.USER);
        Member admin = member("2026129999", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(viewer);
        memberRepository.save(graduate);
        memberRepository.save(admin);

        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("익명글", "내용", "ANONYMOUS", false, "반고닉"),
                null,
                "118.235.10.20"
        );

        var visibleToMember = communityService.get(viewer.getStudentId(), created.id());
        var visibleToAdmin = communityService.get(admin.getStudentId(), created.id());

        assertThat(communityService.list(graduate.getStudentId())).isEmpty();
        assertThatThrownBy(() -> communityService.get(graduate.getStudentId(), created.id()))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        // The IP is reduced to a salted, opaque tag — same IP stays linkable, but no real network
        // octets leak. The tag key is derived from jwt.secret (key separation), not jwt.secret
        // itself: "118.235.10.20" -> HmacSHA256(derivedKey, ip)[0..1] = 1e83.
        assertThat(visibleToMember.authorName()).isEqualTo("반고닉(1e83)");
        assertThat(visibleToMember.authorName()).doesNotContain("118.235");
        assertThat(visibleToMember.authorDisplayName()).isEqualTo("반고닉(1e83)");
        assertThat(visibleToMember.anonymousName()).isEqualTo("반고닉");
        assertThat(visibleToMember.authorStudentId()).isNull();
        assertThat(visibleToAdmin.authorDisplayName()).contains("작성자");
    }

    @Test
    void anonymousCommentsAreMaskedForMembersButVisibleToAdmins() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member commenter = member("2026123456", "댓글러", Member.Role.USER);
        Member admin = member("2026129999", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(commenter);
        memberRepository.save(admin);
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("익명글", "내용", "ANONYMOUS", false), null);

        communityService.addComment(post.id(), commenter.getStudentId(), new CommunityCommentRequest("댓글", null, "ㅇㅇ"), "118.235.1.2");

        assertThat(communityService.listComments(post.id(), author.getStudentId()))
                .singleElement()
                .extracting("authorName")
                .isEqualTo("ㅇㅇ(d55f)");
        assertThat(communityService.listComments(post.id(), admin.getStudentId()))
                .singleElement()
                .extracting("authorName")
                .asString()
                .contains("댓글러");
    }

    @Test
    void pollVotesAreStoredPerPollAndReturnedWithCounts() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member voter = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(voter);
        String content = "[{\"type\":\"poll\",\"pollId\":\"poll-test1\",\"question\":\"선택\",\"options\":[\"A\",\"B\"]}]";
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("투표", content, "GENERAL", false), null);

        var updated = communityService.votePoll(voter.getStudentId(), post.id(), new CommunityPollVoteRequest("poll-test1", 1));

        assertThat(updated.pollResults()).singleElement().satisfies(result -> {
            assertThat(result.pollId()).isEqualTo("poll-test1");
            assertThat(result.optionCounts()).containsExactly(0L, 1L);
            assertThat(result.myOption()).isEqualTo(1);
            assertThat(result.closed()).isFalse();
        });
    }

    @Test
    void pollVotesCannotBeChangedAfterVoting() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member voter = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(voter);
        String content = "[{\"type\":\"poll\",\"pollId\":\"poll-test2\",\"question\":\"선택\",\"options\":[{\"label\":\"A\"},{\"label\":\"B\",\"imageUrl\":\"https://example.com/b.png\"}]}]";
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("투표", content, "GENERAL", false), null);

        communityService.votePoll(voter.getStudentId(), post.id(), new CommunityPollVoteRequest("poll-test2", 0));

        assertThatThrownBy(() -> communityService.votePoll(voter.getStudentId(), post.id(), new CommunityPollVoteRequest("poll-test2", 1)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("이미 투표"));
    }

    @Test
    void authorCanClosePollAndClosedPollRejectsVotes() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member voter = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(voter);
        String content = "[{\"type\":\"poll\",\"pollId\":\"poll-close\",\"question\":\"선택\",\"options\":[\"A\",\"B\"]}]";
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("투표", content, "GENERAL", false), null);

        var closed = communityService.closePoll(author.getStudentId(), post.id(), "poll-close");

        assertThat(closed.pollResults()).singleElement().satisfies(result -> assertThat(result.closed()).isTrue());
        assertThatThrownBy(() -> communityService.votePoll(voter.getStudentId(), post.id(), new CommunityPollVoteRequest("poll-close", 1)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("종료"));
    }

    @Test
    void expiredPollRejectsVotes() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member voter = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(voter);
        String closesAt = java.time.LocalDateTime.now().minusMinutes(1).toString();
        String content = "[{\"type\":\"poll\",\"pollId\":\"poll-expired\",\"question\":\"선택\",\"closesAt\":\"" + closesAt + "\",\"options\":[\"A\",\"B\"]}]";
        var post = communityService.create(author.getStudentId(), new CommunityPostRequest("투표", content, "GENERAL", false), null);

        assertThatThrownBy(() -> communityService.votePoll(voter.getStudentId(), post.id(), new CommunityPollVoteRequest("poll-expired", 1)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getReason()).contains("종료"));
    }

    @Test
    void deleteCommunityDataForMemberRemovesPostsCommentsAndVotes() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member other = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(other);
        var authored = communityService.create(author.getStudentId(), new CommunityPostRequest("삭제될 글", "내용", "GENERAL", false), null);
        var otherPost = communityService.create(other.getStudentId(), new CommunityPostRequest("남을 글", "내용", "GENERAL", false), null);
        communityService.vote(other.getStudentId(), authored.id(), 1);
        communityService.addComment(otherPost.id(), author.getStudentId(), new CommunityCommentRequest("작성자 댓글", null));

        communityService.deleteCommunityDataForMember(author.getStudentId());

        assertThat(communityPostRepository.findById(authored.id())).isEmpty();
        assertThat(commentRepository.findByStudentId(author.getStudentId())).isEmpty();
        assertThat(voteRepository.findByPostIdIn(java.util.List.of(authored.id()))).isEmpty();
        assertThat(communityPostRepository.findById(otherPost.id())).isPresent();
    }

    @Test
    void adminCanDeleteAnyCommunityPostButOtherUsersCannot() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member otherUser = member("2024123456", "다른회원", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(otherUser);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("삭제 권한", "내용", "GENERAL", false),
                null
        );

        assertThatThrownBy(() -> communityService.delete(otherUser.getStudentId(), created.id()))
                .isInstanceOf(ResponseStatusException.class);

        communityService.delete(admin.getStudentId(), created.id(), "운영 기준 위반");

        assertThat(communityPostRepository.findById(created.id())).isEmpty();
    }

    @Test
    void reputationAggregatesPostsCommentsAndReceivedUpvotes() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member voter = member("2026123456", "투표자", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(voter);

        var post = communityService.create(author.getStudentId(),
                new CommunityPostRequest("글", "내용", "GENERAL", false), null);
        communityService.addComment(post.id(), author.getStudentId(),
                new CommunityCommentRequest("댓글", null, null));
        communityService.vote(voter.getStudentId(), post.id(), 1);

        var reputation = communityService.reputation(voter.getStudentId(), author.getStudentId());

        assertThat(reputation.breakdown().posts()).isEqualTo(1);
        assertThat(reputation.breakdown().comments()).isEqualTo(1);
        assertThat(reputation.breakdown().upvotes()).isEqualTo(1);
        // 1 post * 3 + 1 comment * 1 + 1 upvote * 2 = 6
        assertThat(reputation.score()).isEqualTo(6);
        assertThat(reputation.tierLabel()).isEqualTo("신입");
    }

    @Test
    void listInlinesAuthorTierForNonAnonymousPosts() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        communityService.create(author.getStudentId(),
                new CommunityPostRequest("글", "내용", "GENERAL", false), null);

        var posts = communityService.list(author.getStudentId());

        assertThat(posts).singleElement().satisfies(p -> {
            assertThat(p.authorTier()).isEqualTo("NEWCOMER");
            assertThat(p.authorTierLabel()).isEqualTo("신입");
        });
    }

    @Test
    void anonymousPostsDoNotLeakAuthorTier() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member viewer = member("2026123456", "회원", Member.Role.USER);
        memberRepository.save(author);
        memberRepository.save(viewer);
        var created = communityService.create(author.getStudentId(),
                new CommunityPostRequest("익명글", "내용", "ANONYMOUS", false, "반고닉"), null);

        var detail = communityService.get(viewer.getStudentId(), created.id());

        assertThat(detail.authorTier()).isNull();
        assertThat(detail.authorTierLabel()).isNull();
    }

    @Test
    void toggleBookmarkRecoversFromConcurrentInsertConstraintViolation() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(),
                new CommunityPostRequest("질문", "내용", "GENERAL", false), null);

        // A concurrent request already bookmarked the same post.
        CommunityPostBookmark concurrent = new CommunityPostBookmark();
        concurrent.setPost(communityPostRepository.findById(created.id()).orElseThrow());
        concurrent.setStudentId(user.getStudentId());
        bookmarkRepository.saveAndFlush(concurrent);
        // The existence pre-check misses the concurrent row, so the service takes the INSERT branch;
        // that INSERT trips uk_community_post_bookmarks_post_student (simulated via the stubbed throw).
        // The recovery path then re-reads the now-visible row and reports the real bookmarked state.
        doReturn(false).doReturn(true)
                .when(bookmarkRepository).existsByPostIdAndStudentId(created.id(), user.getStudentId());
        doThrow(new DataIntegrityViolationException("uk_community_post_bookmarks_post_student"))
                .when(bookmarkRepository).saveAndFlush(any());

        boolean bookmarked = communityService.toggleBookmark(created.id(), user.getStudentId());

        assertThat(bookmarked).isTrue();
        assertThat(bookmarkRepository.findByStudentIdOrderByCreatedAtDesc(user.getStudentId())).hasSize(1);
    }

    @Test
    void toggleBookmarkInsertsThenRemovesOnSecondCall() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(),
                new CommunityPostRequest("질문", "내용", "GENERAL", false), null);

        assertThat(communityService.toggleBookmark(created.id(), user.getStudentId())).isTrue();
        assertThat(communityService.toggleBookmark(created.id(), user.getStudentId())).isFalse();
        assertThat(bookmarkRepository.existsByPostIdAndStudentId(created.id(), user.getStudentId())).isFalse();
    }

    @Test
    void listBookmarkedReturnsBookmarkedPostsMarkedBookmarked() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var bookmarkedPost = communityService.create(user.getStudentId(),
                new CommunityPostRequest("저장한 글", "내용", "GENERAL", false), null);
        communityService.create(user.getStudentId(),
                new CommunityPostRequest("저장 안 한 글", "내용", "GENERAL", false), null);

        communityService.toggleBookmark(bookmarkedPost.id(), user.getStudentId());

        var bookmarked = communityService.listBookmarked(user.getStudentId());

        assertThat(bookmarked).singleElement().satisfies(post -> {
            assertThat(post.id()).isEqualTo(bookmarkedPost.id());
            assertThat(post.bookmarked()).isTrue();
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
