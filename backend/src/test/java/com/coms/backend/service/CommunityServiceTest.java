package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    private CommunityCommentRepository commentRepository;

    @Autowired
    private CommunityPostImageRepository imageRepository;

    @Autowired
    private CommunityPostFileRepository fileRepository;

    @BeforeEach
    void setUp() {
        fileRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        voteRepository.deleteAll();
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void derivesGenerationDisplayNameFromStudentId() {
        assertThat(CommunityService.generationFromStudentId("2026123456")).isEqualTo("60기");
        assertThat(CommunityService.generationFromStudentId("2025123456")).isEqualTo("59기");
        assertThat(CommunityService.generationFromStudentId("2024123456")).isEqualTo("58기");
        assertThat(CommunityService.displayName("2026123456", "관리자")).isEqualTo("60기관리자");
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
                .contains("60기관리자", "59기회원");
        assertThat(posts)
                .filteredOn(postResponse -> postResponse.authorDisplayName().equals("60기관리자"))
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
    void updateRejectsTitleTamperingAndMarksRealContentEdits() {
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(user);
        var created = communityService.create(user.getStudentId(), new CommunityPostRequest("원제목", "내용", "GENERAL", false), null);

        assertThatThrownBy(() -> communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("바뀐제목", "내용 수정", "GENERAL", false),
                null
        )).isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getReason()).contains("제목"));

        var updated = communityService.update(
                user.getStudentId(),
                created.id(),
                new CommunityPostRequest("원제목", "내용 수정", "INFO", false),
                null
        );

        assertThat(updated.title()).isEqualTo("원제목");
        assertThat(updated.content()).isEqualTo("내용 수정");
        assertThat(updated.edited()).isTrue();
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

        communityService.delete(admin.getStudentId(), created.id());

        assertThat(communityPostRepository.findById(created.id())).isEmpty();
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
