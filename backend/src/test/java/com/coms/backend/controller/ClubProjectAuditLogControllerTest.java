package com.coms.backend.controller;

import com.coms.backend.dto.ClubProjectCategoryRequest;
import com.coms.backend.dto.ClubProjectCategoryResponse;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubProjectCategoryService;
import com.coms.backend.service.ClubProjectService;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.multipart.MultipartFile;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClubProjectAuditLogControllerTest {

    private final ClubProjectService projectService = mock(ClubProjectService.class);
    private final ClubProjectCategoryService categoryService = mock(ClubProjectCategoryService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final ClubProjectController projectController = new ClubProjectController(projectService, auditLogService);
    private final ClubProjectCategoryController categoryController = new ClubProjectCategoryController(categoryService, auditLogService);

    @Test
    void projectCreateUpdateDeleteAndFileMutationsWriteAuditLog() {
        var actor = new TestingAuthenticationToken("2026000001", "password");
        var created = projectResponse(31L, "WEBSITE", "신규 앱", "https://example.com/app");
        when(projectService.create("WEBSITE", "신규 앱", "설명", "Web", "홍길동",
                "https://example.com/app", "example.com/app", 3)).thenReturn(created);

        projectController.create("WEBSITE", "신규 앱", "설명", "Web", "홍길동",
                "https://example.com/app", "example.com/app", 3, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_CREATE"),
                eq("CLUB_PROJECT"),
                eq("31"),
                argThat(detail -> detail.contains("title=신규 앱") && detail.contains("category=WEBSITE")
                        && detail.contains("linkUrl=https://example.com/app")),
                isNull()
        );

        var updated = projectResponse(31L, "APP", "수정 앱", null);
        when(projectService.update(31L, "APP", "수정 앱", null, null, "홍길동",
                null, null, null)).thenReturn(updated);

        projectController.update(31L, "APP", "수정 앱", null, null, "홍길동",
                null, null, null, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_UPDATE"),
                eq("CLUB_PROJECT"),
                eq("31"),
                argThat(detail -> detail.contains("title=수정 앱") && detail.contains("category=APP")),
                isNull()
        );

        when(projectService.get(31L)).thenReturn(projectResponseEntity("삭제 앱", "GAME", "https://example.com/delete"));
        projectController.delete(31L, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_DELETE"),
                eq("CLUB_PROJECT"),
                eq("31"),
                argThat(detail -> detail.contains("title=삭제 앱") && detail.contains("category=GAME")),
                isNull()
        );

        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("app-release.apk");
        when(projectService.addFile(31L, file)).thenReturn(77L);

        projectController.uploadFile(31L, file, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_FILE_CREATE"),
                eq("CLUB_PROJECT_FILE"),
                eq("77"),
                argThat(detail -> detail.contains("projectId=31") && detail.contains("filename=app-release.apk")),
                isNull()
        );

        projectController.deleteFile(31L, 77L, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_FILE_DELETE"),
                eq("CLUB_PROJECT_FILE"),
                eq("77"),
                argThat(detail -> detail.contains("projectId=31")),
                isNull()
        );
    }

    @Test
    void categoryMutationsWriteAuditLog() {
        var actor = new TestingAuthenticationToken("2026000001", "password");
        var request = new ClubProjectCategoryRequest("TOOL", "도구", 4);
        when(categoryService.create(request)).thenReturn(new ClubProjectCategoryResponse(8L, "TOOL", "도구", 4, 0));

        categoryController.create(request, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_CATEGORY_CREATE"),
                eq("CLUB_PROJECT_CATEGORY"),
                eq("8"),
                argThat(detail -> detail.contains("key=TOOL") && detail.contains("name=도구")),
                isNull()
        );

        when(categoryService.update(8L, request)).thenReturn(new ClubProjectCategoryResponse(8L, "TOOL", "도구", 5, 2));

        categoryController.update(8L, request, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_CATEGORY_UPDATE"),
                eq("CLUB_PROJECT_CATEGORY"),
                eq("8"),
                argThat(detail -> detail.contains("key=TOOL") && detail.contains("projectCount=2")),
                isNull()
        );

        categoryController.delete(8L, actor);

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_PROJECT_CATEGORY_DELETE"),
                eq("CLUB_PROJECT_CATEGORY"),
                eq("8"),
                isNull(),
                isNull()
        );
    }

    private ClubProjectResponse projectResponse(Long id, String category, String title, String linkUrl) {
        return new ClubProjectResponse(id, category, category, title, "설명", "Web", "홍길동",
                linkUrl, linkUrl == null ? null : "example.com/app", 0, List.of(),
                LocalDateTime.now(), LocalDateTime.now());
    }

    private com.coms.backend.domain.ClubProject projectResponseEntity(String title, String category, String linkUrl) {
        var project = new com.coms.backend.domain.ClubProject();
        setId(project, 31L);
        project.setTitle(title);
        project.setCategory(category);
        project.setLinkUrl(linkUrl);
        return project;
    }

    private void setId(Object target, Long id) {
        try {
            Field field = target.getClass().getDeclaredField("id");
            field.setAccessible(true);
            field.set(target, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
