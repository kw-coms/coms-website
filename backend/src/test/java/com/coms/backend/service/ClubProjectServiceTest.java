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

    @Autowired
    private ClubProjectService clubProjectService;

    @Autowired
    private ClubProjectCategoryService clubProjectCategoryService;

    @Autowired
    private ClubProjectRepository clubProjectRepository;

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
                    assertThat(p.linkUrl()).isEqualTo("https://coms.kw.ac.kr/PRDoctor/");
                    assertThat(p.displayUrl()).isEqualTo("coms.kw.ac.kr/PRDoctor");
                });
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
    void defaultsMadeByToChoiJunhyukWhenBlank() {
        var created = clubProjectService.create("WEBSITE", "기본 제작자", null, null,
                "  ", null, null, null);
        assertThat(created.madeBy()).isEqualTo("최준혁");
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
                new MockMultipartFile("file", "app-release.apk", "application/vnd.android.package-archive", "apk-bytes".getBytes()));
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
