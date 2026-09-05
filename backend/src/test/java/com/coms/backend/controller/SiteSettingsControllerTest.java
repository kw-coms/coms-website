package com.coms.backend.controller;

import com.coms.backend.dto.SiteSettingsRequest;
import com.coms.backend.dto.SiteSettingsResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.SiteSettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SiteSettingsControllerTest {

    private final SiteSettingsService siteSettingsService = mock(SiteSettingsService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final SiteSettingsController controller = new SiteSettingsController(siteSettingsService, auditLogService);

    @Test
    void publicCurrentReturnsPublishedSettingsWithoutAuthentication() {
        var response = response("2026 Semester Ready");
        when(siteSettingsService.current()).thenReturn(response);

        assertThat(controller.current().getBody()).isEqualTo(response);
    }

    @Test
    void publishIsPermissionGuardedAndWritesAuditLog() throws NoSuchMethodException {
        Method method = SiteSettingsController.class.getMethod(
                "publish",
                SiteSettingsRequest.class,
                org.springframework.security.core.Authentication.class
        );
        // 직급이 아니라 site_settings.edit 권한이 게이트 — 기본값은 임원 이상이고
        // 회장이 권한 매트릭스에서 조정한다.
        assertThat(method.getAnnotation(PreAuthorize.class).value())
                .isEqualTo("@perm.has(authentication,'SITE_SETTINGS_EDIT')");

        var request = new SiteSettingsRequest(
                "2026-2 모집",
                "모집 중",
                "8월 25일 - 9월 5일",
                "COM's 모집",
                "새 학기 모집 안내입니다.",
                List.of(new SiteSettingsRequest.ContactLinkRequest("Mail", "mailto:kwcoms69@gmail.com"))
        );
        when(siteSettingsService.publish(request)).thenReturn(response("2026-2 모집"));

        controller.publish(request, new TestingAuthenticationToken("2026000001", "password"));

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_SITE_SETTINGS_PUBLISH"),
                eq("SITE_SETTINGS"),
                eq("1"),
                argThat(detail -> {
                    assertThat(detail).contains("semesterLabel=2026-2 모집", "recruitmentStatus=모집 안내");
                    return true;
                }),
                isNull()
        );
    }

    private SiteSettingsResponse response(String semesterLabel) {
        return new SiteSettingsResponse(
                1L,
                semesterLabel,
                "모집 안내",
                "상세 일정은 COM's 공식 채널과 학내 공지를 통해 안내됩니다.",
                "COM's",
                "배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.",
                List.of(new SiteSettingsResponse.ContactLink("Mail", "mailto:kwcoms69@gmail.com")),
                LocalDateTime.now(),
                LocalDateTime.now()
        );
    }
}
