package com.coms.backend.service;

import com.coms.backend.dto.ClubProjectCategoryRequest;
import com.coms.backend.repository.ClubProjectRepository;
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
        "spring.datasource.url=jdbc:h2:mem:club-project-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-project-service"
})
@Transactional
class ClubProjectServiceTest {

    // 업로드 검증이 매직 바이트를 확인하므로 픽스처도 실제 시그니처를 가져야 한다(apk 는 ZIP).
    private static final byte[] ZIP_BYTES = {0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00};

    @Autowired
    private ClubProjectService clubProjectService;

    @Autowired
    private ClubProjectCategoryService clubProjectCategoryService;

    @Autowired
    private ClubProjectRepository clubProjectRepository;

    @Autowired
    private com.coms.backend.repository.ClubProjectImageRepository imageRepository;

    @Autowired
    private com.coms.backend.repository.ClubProjectFileRepository fileRepository;

    @Autowired
    private com.coms.backend.repository.MemberRepository memberRepository;

    @Test
    void seedsDefaultProjectsWithMadeByChoiJunhyuk() {
        var projects = clubProjectService.list();
        assertThat(projects).isNotEmpty();
        assertThat(projects).allSatisfy(p -> assertThat(p.madeBy()).isEqualTo("최준혁"));
        assertThat(projects).extracting("title").contains("COMS 월드컵", "Game Club", "BugSnap", "LogDoctor", "PRDoctor");
        // Game Club and the developer tools are seeded under 웹사이트 because they
        // are hosted web services on coms.kw.ac.kr.
        assertThat(projects).filteredOn(p -> p.title().equals("Game Club"))
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.category()).isEqualTo("WEBSITE");
                    assertThat(p.categoryName()).isEqualTo("웹사이트");
                });
        assertThat(projects).filteredOn(p -> p.title().equals("COMS 월드컵"))
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.category()).isEqualTo("WEBSITE");
                    assertThat(p.linkUrl()).isEqualTo("https://coms.kw.ac.kr/worldcup/");
                    assertThat(p.displayUrl()).isEqualTo("coms.kw.ac.kr/worldcup");
                });
        assertThat(projects).filteredOn(p -> p.title().equals("PRDoctor"))
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.category()).isEqualTo("WEBSITE");
                    assertThat(p.eyebrow()).isEqualTo("PR review");
                    assertThat(p.linkUrl()).isEqualTo("https://coms.kw.ac.kr/PRDoctor");
                    assertThat(p.displayUrl()).isEqualTo("coms.kw.ac.kr/PRDoctor");
                });
    }

    @Test
    void memberOwnsOnlyTheirOwnProjectAndCannotClaimLegacyEntry() {
        var member = new com.coms.backend.domain.Member();
        member.setStudentId("2099000001");
        member.setName("작품 회원");
        member.setEmail("works-test@example.invalid");
        member.setPassword("unused");
        memberRepository.save(member);

        long publicCount = clubProjectCategoryService.list().stream()
                .filter(category -> category.key().equals("APP")).findFirst().orElseThrow().projectCount();
        var created = clubProjectService.createForMember("2099000001", "APP", "회원 작품", "소개", null, "https://example.com");
        assertThat(created.madeBy()).isEqualTo("작품 회원");
        assertThat(created.canEdit()).isTrue();
        assertThat(created.reviewStatus()).isEqualTo("PENDING");
        assertThat(clubProjectService.list()).noneMatch(p -> p.id().equals(created.id()));
        assertThat(clubProjectCategoryService.list().stream()
                .filter(category -> category.key().equals("APP")).findFirst().orElseThrow().projectCount())
                .isEqualTo(publicCount);
        assertThat(clubProjectService.list("2099000001", false)).filteredOn(p -> p.id().equals(created.id()))
                .singleElement().satisfies(p -> assertThat(p.canEdit()).isTrue());
        clubProjectService.review(created.id(), com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED,
                clubProjectRepository.findById(created.id()).orElseThrow().getVersion());
        assertThat(clubProjectCategoryService.list().stream()
                .filter(category -> category.key().equals("APP")).findFirst().orElseThrow().projectCount())
                .isEqualTo(publicCount + 1);
        assertThat(clubProjectService.list("2099000002", false)).filteredOn(p -> p.id().equals(created.id()))
                .singleElement().satisfies(p -> assertThat(p.canEdit()).isFalse());
        assertThatThrownBy(() -> clubProjectService.requireEditor(created.id(), "2099000002", false))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode().value()).isEqualTo(403));
        Long legacyId = clubProjectService.list().stream().filter(p -> !p.id().equals(created.id())).findFirst().orElseThrow().id();
        assertThatThrownBy(() -> clubProjectService.requireEditor(legacyId, "2099000001", false))
                .isInstanceOf(ResponseStatusException.class);
        clubProjectService.requireEditor(legacyId, "2099000001", true);
        var changed = clubProjectService.updateForMember(created.id(), "2099000001", null, "새 제목", "새 소개", null, "");
        assertThat(changed.title()).isEqualTo("새 제목");
        assertThat(changed.description()).isEqualTo("새 소개");
        assertThat(changed.madeBy()).isEqualTo("작품 회원");
    }

    @Test
    void imageUploadChecksActualBytesAndCountsCoverFirst() {
        var project = clubProjectService.create("APP", "사진 작품", null, null, "제작자", null, null, null);
        var fake = new MockMultipartFile("images", "fake.png", "image/png", "not an image".getBytes());
        assertThatThrownBy(() -> clubProjectService.addImages(project.id(), java.util.List.of(fake), null, true))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode().value()).isEqualTo(400));
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
        var image = new MockMultipartFile("images", "cover.png", "image/png", png);
        Long imageId = clubProjectService.addImages(project.id(), java.util.List.of(image), null, true).getFirst();
        assertThat(clubProjectService.list(null, true).stream().filter(p -> p.id().equals(project.id())).findFirst().orElseThrow().images())
                .singleElement().satisfies(info -> assertThat(info.url()).endsWith("/images/" + imageId));
        assertThat(clubProjectService.loadImageResource(project.id(), imageId).exists()).isTrue();
        assertThatThrownBy(() -> clubProjectService.addImages(project.id(), java.util.Collections.nCopies(6, image), null, true))
                .isInstanceOf(ResponseStatusException.class);
        clubProjectService.deleteImage(project.id(), imageId, null, true);
        assertThat(clubProjectService.list(null, true).stream().filter(p -> p.id().equals(project.id())).findFirst().orElseThrow().images()).isEmpty();
    }

    private static final byte[] PNG = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");

    private void saveMember(String studentId) {
        var member = new com.coms.backend.domain.Member();
        member.setStudentId(studentId);
        member.setName("회원 " + studentId);
        member.setEmail(studentId + "@example.invalid");
        member.setPassword("unused");
        memberRepository.save(member);
    }

    @Test
    void ownerImageUploadRequeuesAnApprovedProjectBeforeReturning() {
        saveMember("2099000011");
        var project = clubProjectService.createForMember("2099000011", "APP", "새 이미지 작품", "소개", null, null);
        var fileId = clubProjectService.addFile(project.id(),
                new MockMultipartFile("file", "release.zip", "application/zip", ZIP_BYTES));
        clubProjectService.review(project.id(), com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED,
                clubProjectRepository.findById(project.id()).orElseThrow().getVersion());
        long versionBefore = clubProjectRepository.findById(project.id()).orElseThrow().getVersion();
        var image = new MockMultipartFile("images", "new.png", "image/png", PNG);

        Long imageId = clubProjectService.addImages(project.id(), java.util.List.of(image), "2099000011", false).getFirst();

        assertThat(clubProjectRepository.findById(project.id()).orElseThrow().getReviewStatus())
                .isEqualTo(com.coms.backend.domain.ClubProject.ReviewStatus.PENDING);
        assertThat(clubProjectRepository.findById(project.id()).orElseThrow().getVersion()).isGreaterThan(versionBefore);
        assertThatThrownBy(() -> clubProjectService.loadVisibleImageMeta(project.id(), imageId, null, false))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> clubProjectService.loadVisibleFileMeta(project.id(), fileId, null, false))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(imageRepository.findVisibleByProjectIds(java.util.List.of(project.id()),
                com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED, false, null)).isEmpty();
        assertThat(fileRepository.findVisibleByProjectIds(java.util.List.of(project.id()),
                com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED, false, null)).isEmpty();
        assertThat(imageRepository.findVisibleByProjectIds(java.util.List.of(project.id()),
                com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED, true, null)).hasSize(1);
    }

    @Test
    void managerImageUploadKeepsApprovedProjectVisibleToGuests() {
        var project = clubProjectService.create("APP", "관리자 이미지 작품", null, null, "제작자", null, null, null);
        assertThat(clubProjectRepository.findById(project.id()).orElseThrow().getReviewStatus())
                .isEqualTo(com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED);
        var image = new MockMultipartFile("images", "new.png", "image/png", PNG);

        Long imageId = clubProjectService.addImages(project.id(), java.util.List.of(image), null, true).getFirst();

        assertThat(clubProjectRepository.findById(project.id()).orElseThrow().getReviewStatus())
                .isEqualTo(com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED);
        assertThat(clubProjectService.loadVisibleImageMeta(project.id(), imageId, null, false)).isNotNull();
        assertThat(imageRepository.findVisibleByProjectIds(java.util.List.of(project.id()),
                com.coms.backend.domain.ClubProject.ReviewStatus.APPROVED, false, null)).hasSize(1);
    }

    @Test
    void imageDeleteChecksPermissionBeforeLookingUpTheImage() {
        saveMember("2099000012");
        saveMember("2099000013");
        var project = clubProjectService.createForMember("2099000012", "APP", "삭제 작품", "소개", null, null);
        var image = new MockMultipartFile("images", "new.png", "image/png", PNG);
        Long imageId = clubProjectService.addImages(project.id(), java.util.List.of(image), "2099000012", false).getFirst();

        // Existing and missing image ids must be indistinguishable to a non-editor.
        for (Long probe : new Long[]{imageId, imageId + 9999}) {
            assertThatThrownBy(() -> clubProjectService.deleteImage(project.id(), probe, "2099000013", false))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode().value()).isEqualTo(403));
        }
    }

    @Test
    void createsUpdatesAndDeletesProject() {
        var created = clubProjectService.create("APP", "테스트 앱", "설명입니다.", "Mobile",
                "홍길동", null, null, null);
        assertThat(created.category()).isEqualTo("APP");
        assertThat(created.categoryName()).isEqualTo("앱");
        assertThat(created.title()).isEqualTo("테스트 앱");
        assertThat(created.madeBy()).isEqualTo("홍길동");
        assertThat(created.files()).isEmpty();

        var updated = clubProjectService.update(created.id(), "GAME", "수정된 앱", "새 설명", null,
                null, "https://example.com", "example.com", null);
        assertThat(updated.category()).isEqualTo("GAME");
        assertThat(updated.title()).isEqualTo("수정된 앱");
        assertThat(updated.description()).isEqualTo("새 설명");
        assertThat(updated.linkUrl()).isEqualTo("https://example.com");
        assertThat(updated.displayUrl()).isEqualTo("example.com");
        // madeBy preserved when not provided.
        assertThat(updated.madeBy()).isEqualTo("홍길동");

        clubProjectService.delete(created.id());
        assertThat(clubProjectService.list()).filteredOn(p -> p.id().equals(created.id())).isEmpty();
    }

    @Test
    void doesNotDefaultMadeByWhenBlank() {
        var created = clubProjectService.create("WEBSITE", "기본 제작자", null, null,
                "  ", null, null, null);
        assertThat(created.madeBy()).isNull();
    }

    @Test
    void bylineIsPlainBoundedText() {
        assertThatThrownBy(() -> clubProjectService.create("APP", "작품", null, null,
                "<script>alert(1)</script>", null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode().value()).isEqualTo(400));
        assertThatThrownBy(() -> clubProjectService.create("APP", "작품", null, null,
                "A\nB", null, null, null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> clubProjectService.create("APP", "작품", null, null,
                "a".repeat(101), null, null, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void emptyRepositoryReturnsNoPublicProjects() {
        clubProjectRepository.deleteAll();
        assertThat(clubProjectService.list()).isEmpty();
    }

    @Test
    void rejectsDangerousProjectUrls() {
        assertThatThrownBy(() -> clubProjectService.create("WEBSITE", "스크립트 링크", null, null,
                "최준혁", "javascript:alert(1)", null, null))
                .isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> clubProjectService.create("WEBSITE", "사용자정보 링크", null, null,
                "최준혁", "https://user@example.com/app", null, null))
                .isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> clubProjectService.create("WEBSITE", "제어문자 링크", null, null,
                "최준혁", "https://example.com/\napp", null, null))
                .isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> clubProjectService.create("WEBSITE", "표시 링크", null, null,
                "최준혁", "https://example.com/app", "javascript:alert(1)", null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void acceptsOnlyHttpProjectUrls() {
        var created = clubProjectService.create("WEBSITE", "정상 링크", null, null,
                "최준혁", " https://example.com/app?q=1 ", " example.com/app ", null);
        assertThat(created.linkUrl()).isEqualTo("https://example.com/app?q=1");
        assertThat(created.displayUrl()).isEqualTo("example.com/app");

        var explicitDisplayUrl = clubProjectService.create("WEBSITE", "표시 정상 링크", null, null,
                "최준혁", "https://example.com/app", " https://example.com/app ", null);
        assertThat(explicitDisplayUrl.displayUrl()).isEqualTo("https://example.com/app");
    }

    @Test
    void rejectsInvalidCategoryAndBlankTitle() {
        assertThatThrownBy(() -> clubProjectService.create("UNKNOWN", "잘못된 분류", null, null,
                "최준혁", null, null, null))
                .isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> clubProjectService.create("WEBSITE", "  ", null, null,
                "최준혁", null, null, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void uploadsAndDownloadsDistributableFileThenRemovesIt() {
        var project = clubProjectService.create("APP", "배포 앱", null, null, "최준혁", null, null, null);

        var fileId = clubProjectService.addFile(project.id(),
                new MockMultipartFile("file", "app-release.apk", "application/vnd.android.package-archive", ZIP_BYTES));
        assertThat(fileId).isNotNull();

        var withFile = clubProjectService.list().stream()
                .filter(p -> p.id().equals(project.id()))
                .findFirst()
                .orElseThrow();
        assertThat(withFile.files()).hasSize(1);
        assertThat(withFile.files().get(0).originalName()).isEqualTo("app-release.apk");
        assertThat(withFile.files().get(0).url())
                .isEqualTo("/api/club-projects/" + project.id() + "/files/" + fileId + "/download");

        var meta = clubProjectService.loadFileMeta(project.id(), fileId);
        assertThat(meta.getOriginalName()).isEqualTo("app-release.apk");
        var resource = clubProjectService.loadFileResource(project.id(), fileId);
        assertThat(resource.exists()).isTrue();

        clubProjectService.deleteFile(project.id(), fileId);
        var after = clubProjectService.list().stream()
                .filter(p -> p.id().equals(project.id()))
                .findFirst()
                .orElseThrow();
        assertThat(after.files()).isEmpty();
    }

    @Test
    void categoryCrudAndDeletionGuardWhenInUse() {
        var created = clubProjectCategoryService.create(
                new ClubProjectCategoryRequest(null, "도구", null));
        assertThat(created.key()).isNotBlank();
        assertThat(created.name()).isEqualTo("도구");

        var renamed = clubProjectCategoryService.update(created.id(),
                new ClubProjectCategoryRequest(null, "유틸리티", null));
        assertThat(renamed.name()).isEqualTo("유틸리티");

        // Unused category can be deleted.
        clubProjectCategoryService.delete(created.id());

        // A category in use cannot be deleted.
        var inUse = clubProjectCategoryService.create(
                new ClubProjectCategoryRequest(null, "확장팩", null));
        clubProjectService.create(inUse.key(), "확장팩 프로젝트", null, null, "최준혁", null, null, null);
        assertThatThrownBy(() -> clubProjectCategoryService.delete(inUse.id()))
                .isInstanceOf(ResponseStatusException.class);
    }
}
