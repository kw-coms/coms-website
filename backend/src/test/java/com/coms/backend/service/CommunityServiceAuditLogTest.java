package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityCommentRequest;
import com.coms.backend.dto.DeletedCommunityPostAppealRequest;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.repository.AuditLogRepository;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.DeletedCommunityPostCommentRepository;
import com.coms.backend.repository.DeletedCommunityPostAppealRepository;
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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-service-audit-log-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/community-service-audit-log"
})
@WithMockUser(roles = "ADMIN")
class CommunityServiceAuditLogTest {

    // 업로드 검증이 매직 바이트를 확인하므로 이미지 픽스처는 실제 PNG 여야 한다.
    // (PNG 는 저장 시 메타데이터 제거를 위해 디코딩되므로 시그니처만으로는 부족하다.)
    private static final byte[] COVER_PNG = onePixelPng(0x112233);
    private static final byte[] INLINE_PNG = onePixelPng(0x445566);
    private static final byte[] ZIP_BYTES = {0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00};

    private static byte[] onePixelPng(int rgb) {
        try {
            var image = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB);
            image.setRGB(0, 0, rgb);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(image, "png", out);
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }
    @Autowired
    private CommunityService communityService;

    @Autowired
    private CommunityDeletionArchiveService communityDeletionArchiveService;

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

    @Autowired
    private DeletedCommunityPostImageRepository deletedCommunityPostImageRepository;

    @Autowired
    private DeletedCommunityPostMediaRepository deletedCommunityPostMediaRepository;

    @Autowired
    private DeletedCommunityPostCommentRepository deletedCommunityPostCommentRepository;

    @Autowired
    private DeletedCommunityPostAppealRepository deletedCommunityPostAppealRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @BeforeEach
    @AfterEach
    void clean() {
        notificationRepository.deleteAll();
        deletedCommunityPostAppealRepository.deleteAll();
        deletedCommunityPostCommentRepository.deleteAll();
        deletedCommunityPostMediaRepository.deleteAll();
        deletedCommunityPostImageRepository.deleteAll();
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
    void authorCanReviewDeletedPostAndRequestRestore() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member other = member("2025222222", "다른회원", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(other);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("억울한 삭제 기록", "삭제된 원문입니다.", "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "운영 기준 재검토 필요");

        var snapshot = deletedCommunityPostRepository.findAll().get(0);
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author.getStudentId()))
                .singleElement()
                .satisfies(notification -> {
                    assertThat(notification.getType().name()).isEqualTo("COMMUNITY_POST_DELETED");
                    assertThat(notification.getPostId()).isNull();
                    assertThat(notification.getActorStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(notification.getMessage()).contains("억울한 삭제 기록", "운영 기준 재검토 필요");
                });
        assertThat(communityDeletionArchiveService.mine(author.getStudentId()))
                .singleElement()
                .satisfies(record -> {
                    assertThat(record.id()).isEqualTo(snapshot.getId());
                    assertThat(record.title()).isEqualTo("억울한 삭제 기록");
                    assertThat(record.content()).contains("삭제된 원문");
                    assertThat(record.deletedByStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(record.deletedByName()).isEqualTo(admin.getName());
                    assertThat(record.deletionReason()).isEqualTo("운영 기준 재검토 필요");
                    assertThat(record.latestAppealStatus()).isNull();
                });
        assertThat(communityDeletionArchiveService.mine(other.getStudentId())).isEmpty();

        var appeal = communityDeletionArchiveService.requestRestore(
                snapshot.getId(),
                author.getStudentId(),
                new DeletedCommunityPostAppealRequest("동아리 규칙 위반이 아니라고 생각합니다.")
        );

        assertThat(appeal.status()).isEqualTo("OPEN");
        assertThat(appeal.message()).contains("규칙 위반");
        assertThat(communityDeletionArchiveService.mine(author.getStudentId()))
                .singleElement()
                .satisfies(record -> {
                    assertThat(record.latestAppealStatus()).isEqualTo("OPEN");
                    assertThat(record.latestAppealMessage()).contains("규칙 위반");
                    assertThat(record.latestAppealCreatedAt()).isNotNull();
                });
        assertThat(communityDeletionArchiveService.recent(10))
                .singleElement()
                .satisfies(record -> {
                    assertThat(record.latestAppealStatus()).isEqualTo("OPEN");
                    assertThat(record.latestAppealRequesterStudentId()).isEqualTo(author.getStudentId());
                });
        assertThatThrownBy(() -> communityDeletionArchiveService.requestRestore(
                snapshot.getId(),
                other.getStudentId(),
                new DeletedCommunityPostAppealRequest("제가 대신 요청합니다.")
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
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
    void adminDeletionArchivesOriginalImagesAndKeepsThemReadable() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        MockMultipartFile cover = new MockMultipartFile("image", "cover.png", "image/png", COVER_PNG);
        MockMultipartFile inline = new MockMultipartFile("images", "inline.png", "image/png", INLINE_PNG);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사진 보관 대상", "임시 본문", "GENERAL", false),
                cover
        );
        Long inlineImageId = communityService.addImages(author.getStudentId(), created.id(), java.util.List.of(inline)).get(0);
        String content = """
                [{"type":"text","content":"사진까지 보관해야 하는 원문입니다."},
                 {"type":"image","mediaId":%d,"name":"inline.png","width":75,"align":"center"}]
                """.formatted(inlineImageId);
        communityService.update(
                author.getStudentId(),
                created.id(),
                new CommunityPostRequest("사진 보관 대상", content, "GENERAL", false),
                null
        );

        communityService.delete(admin.getStudentId(), created.id(), "이미지 증거 확인");

        var snapshot = deletedCommunityPostRepository.findAll().get(0);
        assertThat(deletedCommunityPostImageRepository.findByDeletedPostIdOrderByPositionAsc(snapshot.getId()))
                .hasSize(2)
                .anySatisfy(image -> {
                    assertThat(image.getKind()).isEqualTo("COVER");
                    assertThat(image.getOriginalName()).isEqualTo("cover.png");
                })
                .anySatisfy(image -> {
                    assertThat(image.getKind()).isEqualTo("INLINE");
                    assertThat(image.getOriginalImageId()).isEqualTo(inlineImageId);
                    assertThat(image.getOriginalName()).isEqualTo("inline.png");
                    assertThat(communityDeletionArchiveService.loadImage(snapshot.getId(), image.getId()).getInputStream().readAllBytes())
                            .isEqualTo(INLINE_PNG);
                });

        assertThat(communityDeletionArchiveService.recent(10))
                .singleElement()
                .satisfies(response -> assertThat(response.imageInfos())
                        .extracting(DeletedCommunityPostResponse.ImageInfo::originalName)
                        .containsExactly("cover.png", "inline.png"));
    }

    @Test
    void adminCanRestoreDeletedPostWithImagesAndInlineMediaIds() {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        MockMultipartFile cover = new MockMultipartFile("image", "cover.png", "image/png", COVER_PNG);
        MockMultipartFile inline = new MockMultipartFile("images", "inline.png", "image/png", INLINE_PNG);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("복원 대상", "임시 본문", "QUESTION", false),
                cover
        );
        Long originalInlineId = communityService.addImages(author.getStudentId(), created.id(), java.util.List.of(inline)).get(0);
        String content = """
                [{"type":"text","content":"복원해야 하는 사진 원문입니다."},
                 {"type":"image","mediaId":%d,"name":"inline.png","width":75,"align":"center"}]
                """.formatted(originalInlineId);
        communityService.update(
                author.getStudentId(),
                created.id(),
                new CommunityPostRequest("복원 대상", content, "QUESTION", false),
                null
        );
        communityService.delete(admin.getStudentId(), created.id(), "복원 테스트");
        Long snapshotId = deletedCommunityPostRepository.findAll().get(0).getId();

        var restored = communityDeletionArchiveService.restore(snapshotId, admin.getStudentId());

        assertThat(restored.restoredPostId()).isNotNull();
        var restoredPost = communityPostRepository.findById(restored.restoredPostId()).orElseThrow();
        assertThat(restoredPost.getTitle()).isEqualTo("복원 대상");
        assertThat(restoredPost.getAuthorStudentId()).isEqualTo(author.getStudentId());
        assertThat(restoredPost.getCategory()).isEqualTo(com.coms.backend.domain.CommunityPost.Category.QUESTION);
        assertThat(restoredPost.getImageOriginalName()).isEqualTo("cover.png");
        var restoredImages = imageRepository.findByPostIdOrderByPositionAsc(restoredPost.getId());
        assertThat(restoredImages).singleElement()
                .satisfies(image -> assertThat(restoredPost.getContent()).contains("\"mediaId\":" + image.getId()));
        assertThat(restoredPost.getContent()).doesNotContain("\"mediaId\":" + originalInlineId);
        assertThat(notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(author.getStudentId()))
                .filteredOn(notification -> notification.getType().name().equals("COMMUNITY_POST_RESTORED"))
                .singleElement()
                .satisfies(notification -> {
                    assertThat(notification.getType().name()).isEqualTo("COMMUNITY_POST_RESTORED");
                    assertThat(notification.getPostId()).isEqualTo(restoredPost.getId());
                    assertThat(notification.getActorStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(notification.getMessage()).contains("복원");
                });
        assertThat(communityDeletionArchiveService.recent(10))
                .singleElement()
                .satisfies(response -> {
                    assertThat(response.restoredPostId()).isEqualTo(restoredPost.getId());
                    assertThat(response.restoredByStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(response.restoredAt()).isNotNull();
                });
        assertThat(auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 10)))
                .filteredOn(log -> log.getAction().equals("COMMUNITY_POST_RESTORE"))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getActorStudentId()).isEqualTo(admin.getStudentId());
                    assertThat(log.getTargetId()).isEqualTo(String.valueOf(restoredPost.getId()));
                    assertThat(log.getDetail()).contains("deletedSnapshotId=" + snapshotId);
                });
        assertThatThrownBy(() -> communityDeletionArchiveService.restore(snapshotId, admin.getStudentId()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void adminCanRestoreDeletedPostWithCommentsVideosAndFiles() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member commenter = member("2025222222", "댓글러", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(commenter);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("댓글 첨부 복원 대상", "임시 본문", "GENERAL", false),
                null
        );
        Long originalVideoId = communityService.addVideo(
                author.getStudentId(),
                created.id(),
                new MockMultipartFile("video", "demo.mp4", "video/mp4", "video".getBytes())
        );
        Long originalFileId = communityService.addFile(
                author.getStudentId(),
                created.id(),
                new MockMultipartFile("file", "source.zip", "application/zip", ZIP_BYTES)
        );
        String content = """
                [{"type":"text","content":"영상과 첨부, 댓글까지 복원되어야 합니다."},
                 {"type":"video","mediaId":%d,"name":"demo.mp4","width":75,"align":"center"},
                 {"type":"file","fileId":%d,"name":"source.zip"}]
                """.formatted(originalVideoId, originalFileId);
        communityService.update(
                author.getStudentId(),
                created.id(),
                new CommunityPostRequest("댓글 첨부 복원 대상", content, "GENERAL", false),
                null
        );
        var root = communityService.addComment(
                created.id(),
                commenter.getStudentId(),
                new CommunityCommentRequest("첫 댓글", null)
        );
        var reply = communityService.addComment(
                created.id(),
                author.getStudentId(),
                new CommunityCommentRequest("답글", root.id())
        );

        communityService.delete(admin.getStudentId(), created.id(), "첨부와 댓글 증거 확인");
        Long snapshotId = deletedCommunityPostRepository.findAll().get(0).getId();

        assertThat(deletedCommunityPostMediaRepository.findByDeletedPostIdOrderByPositionAsc(snapshotId))
                .hasSize(2)
                .extracting("originalName")
                .containsExactly("demo.mp4", "source.zip");
        assertThat(deletedCommunityPostCommentRepository.findByDeletedPostIdOrderByDepthAscCreatedAtAsc(snapshotId))
                .hasSize(2)
                .extracting("content")
                .containsExactly("첫 댓글", "답글");
        assertThat(communityDeletionArchiveService.recent(10))
                .singleElement()
                .satisfies(response -> {
                    assertThat(response.videoInfos()).singleElement()
                            .satisfies(video -> assertThat(video.originalMediaId()).isEqualTo(originalVideoId));
                    assertThat(response.fileInfos()).singleElement()
                            .satisfies(file -> assertThat(file.originalMediaId()).isEqualTo(originalFileId));
                    assertThat(response.commentCount()).isEqualTo(2);
                    assertThat(response.commentInfos())
                            .extracting(DeletedCommunityPostResponse.CommentInfo::content)
                            .containsExactly("첫 댓글", "답글");
                });

        Long restoredPostId = communityDeletionArchiveService.restore(snapshotId, admin.getStudentId()).restoredPostId();

        var restoredVideos = videoRepository.findByPostIdOrderByPositionAsc(restoredPostId);
        var restoredFiles = fileRepository.findByPostIdOrderByPositionAsc(restoredPostId);
        assertThat(restoredVideos).singleElement()
                .satisfies(video -> assertThat(video.getOriginalName()).isEqualTo("demo.mp4"));
        assertThat(restoredFiles).singleElement()
                .satisfies(file -> assertThat(file.getOriginalName()).isEqualTo("source.zip"));
        var restoredPost = communityPostRepository.findById(restoredPostId).orElseThrow();
        assertThat(restoredPost.getContent())
                .contains("\"mediaId\":" + restoredVideos.get(0).getId())
                .contains("\"fileId\":" + restoredFiles.get(0).getId())
                .doesNotContain("\"mediaId\":" + originalVideoId)
                .doesNotContain("\"fileId\":" + originalFileId);
        var restoredComments = commentRepository.findByPostIdOrderByCreatedAtAsc(restoredPostId);
        assertThat(restoredComments).hasSize(2);
        assertThat(restoredComments.get(0).getContent()).isEqualTo("첫 댓글");
        assertThat(restoredComments.get(1).getContent()).isEqualTo("답글");
        assertThat(restoredComments.get(1).getParentCommentId()).isEqualTo(restoredComments.get(0).getId());
        assertThat(root.id()).isNotEqualTo(restoredComments.get(0).getId());
        assertThat(reply.id()).isNotEqualTo(restoredComments.get(1).getId());
    }

    @Test
    void deletedPostDetailExposesArchivedCommentsAndImages() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member commenter = member("2025222222", "댓글러", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(commenter);
        memberRepository.save(admin);
        MockMultipartFile cover = new MockMultipartFile("image", "cover.png", "image/png", COVER_PNG);
        MockMultipartFile inline = new MockMultipartFile("images", "inline.png", "image/png", INLINE_PNG);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("상세 보기 대상", "임시 본문", "GENERAL", false),
                cover
        );
        Long inlineImageId = communityService.addImages(author.getStudentId(), created.id(), java.util.List.of(inline)).get(0);
        String content = """
                [{"type":"text","content":"상세 보기에서 보여야 하는 원문입니다."},
                 {"type":"image","mediaId":%d,"name":"inline.png","width":75,"align":"center"}]
                """.formatted(inlineImageId);
        communityService.update(
                author.getStudentId(),
                created.id(),
                new CommunityPostRequest("상세 보기 대상", content, "GENERAL", false),
                null
        );
        var root = communityService.addComment(
                created.id(),
                commenter.getStudentId(),
                new CommunityCommentRequest("최상위 댓글", null)
        );
        communityService.addComment(
                created.id(),
                author.getStudentId(),
                new CommunityCommentRequest("대댓글", root.id())
        );

        communityService.delete(admin.getStudentId(), created.id(), "상세 보기 증거 확인");
        Long snapshotId = deletedCommunityPostRepository.findAll().get(0).getId();

        DeletedCommunityPostResponse detail = communityDeletionArchiveService.detail(snapshotId);

        assertThat(detail.id()).isEqualTo(snapshotId);
        assertThat(detail.title()).isEqualTo("상세 보기 대상");
        assertThat(detail.authorStudentId()).isEqualTo(author.getStudentId());
        assertThat(detail.imageInfos())
                .extracting(DeletedCommunityPostResponse.ImageInfo::originalName)
                .containsExactly("cover.png", "inline.png");
        assertThat(detail.imageInfos())
                .allSatisfy(image -> assertThat(image.url())
                        .startsWith("/api/admin/community/deleted-posts/" + snapshotId + "/images/"));
        assertThat(detail.commentCount()).isEqualTo(2);
        assertThat(detail.commentInfos())
                .hasSize(2)
                .satisfies(comments -> {
                    assertThat(comments.get(0).content()).isEqualTo("최상위 댓글");
                    assertThat(comments.get(0).depth()).isEqualTo(0);
                    assertThat(comments.get(0).originalParentCommentId()).isNull();
                    assertThat(comments.get(1).content()).isEqualTo("대댓글");
                    assertThat(comments.get(1).depth()).isEqualTo(1);
                    assertThat(comments.get(1).originalParentCommentId()).isEqualTo(comments.get(0).originalCommentId());
                });
    }

    @Test
    void removingRestoredImageKeepsDeletedArchiveEvidenceReadable() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        memberRepository.save(author);
        memberRepository.save(admin);
        var created = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("복원 이미지 삭제 대상", "임시 본문", "GENERAL", false),
                null
        );
        Long originalImageId = communityService.addImages(
                author.getStudentId(),
                created.id(),
                java.util.List.of(new MockMultipartFile("images", "inline.png", "image/png", INLINE_PNG))
        ).get(0);
        communityService.update(
                author.getStudentId(),
                created.id(),
                new CommunityPostRequest("복원 이미지 삭제 대상", """
                        [{"type":"text","content":"복원 후에도 보관함 사진은 남아야 합니다."},
                         {"type":"image","mediaId":%d,"name":"inline.png","width":75,"align":"center"}]
                        """.formatted(originalImageId), "GENERAL", false),
                null
        );
        communityService.delete(admin.getStudentId(), created.id(), "복원 이미지 보존 테스트");
        Long snapshotId = deletedCommunityPostRepository.findAll().get(0).getId();
        Long archivedImageId = deletedCommunityPostImageRepository.findByDeletedPostIdOrderByPositionAsc(snapshotId).get(0).getId();
        Long restoredPostId = communityDeletionArchiveService.restore(snapshotId, admin.getStudentId()).restoredPostId();
        Long restoredImageId = imageRepository.findByPostIdOrderByPositionAsc(restoredPostId).get(0).getId();

        communityService.deleteImage(admin.getStudentId(), restoredPostId, restoredImageId);

        assertThat(communityDeletionArchiveService.loadImage(snapshotId, archivedImageId).getInputStream().readAllBytes())
                .isEqualTo(INLINE_PNG);
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
