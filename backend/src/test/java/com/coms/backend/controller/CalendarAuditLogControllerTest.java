package com.coms.backend.controller;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.dto.ClubActivityResponse;
import com.coms.backend.dto.RecurringScheduleExceptionRequest;
import com.coms.backend.dto.RecurringScheduleExceptionResponse;
import com.coms.backend.dto.RecurringScheduleRequest;
import com.coms.backend.dto.RecurringScheduleResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubActivityService;
import com.coms.backend.service.RecurringScheduleService;
import com.coms.backend.service.StorageService;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CalendarAuditLogControllerTest {

    private final ClubActivityService clubActivityService = mock(ClubActivityService.class);
    private final StorageService storageService = mock(StorageService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final ClubActivityController clubActivityController = new ClubActivityController(
            clubActivityService,
            storageService,
            auditLogService
    );

    private final RecurringScheduleService recurringScheduleService = mock(RecurringScheduleService.class);
    private final RecurringScheduleController recurringScheduleController = new RecurringScheduleController(
            recurringScheduleService,
            auditLogService
    );

    @Test
    void dateScheduleUpdateWritesAdminAuditLog() {
        when(clubActivityService.update(
                eq(41L),
                eq("SCHEDULE"),
                eq("GENERAL"),
                eq("운영 회의"),
                isNull(),
                eq(LocalDate.of(2026, 6, 11)),
                eq(LocalDate.of(2026, 6, 11)),
                eq("18:30"),
                eq("19:30"),
                eq("#34c759"),
                eq("2026000001")
        )).thenReturn(activityResponse(41L, "SCHEDULE", "운영 회의", "#34c759"));

        clubActivityController.update(
                41L,
                "SCHEDULE",
                "GENERAL",
                "운영 회의",
                null,
                LocalDate.of(2026, 6, 11),
                LocalDate.of(2026, 6, 11),
                "18:30",
                "19:30",
                "#34c759",
                new TestingAuthenticationToken("2026000001", "password")
        );

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_DATE_SCHEDULE_UPDATE"),
                eq("CLUB_ACTIVITY_SCHEDULE"),
                eq("41"),
                argThat(detail -> {
                    assertThat(detail).contains("title=운영 회의", "date=2026-06-11", "color=#34c759");
                    return true;
                }),
                isNull()
        );
    }

    @Test
    void dateScheduleDeleteWritesAdminAuditLogWithSnapshot() {
        ClubActivity activity = new ClubActivity();
        activity.setKind(ClubActivity.Kind.SCHEDULE);
        activity.setCategory("GENERAL");
        activity.setTitle("삭제할 일정");
        activity.setEventDate(LocalDate.of(2026, 6, 12));
        activity.setEndDate(LocalDate.of(2026, 6, 12));
        activity.setColorHex("#ff9f0a");
        when(clubActivityService.get(42L)).thenReturn(activity);

        clubActivityController.delete(42L, new TestingAuthenticationToken("2026000001", "password"));

        verify(clubActivityService).delete(42L);
        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_DATE_SCHEDULE_DELETE"),
                eq("CLUB_ACTIVITY_SCHEDULE"),
                eq("42"),
                argThat(detail -> {
                    assertThat(detail).contains("title=삭제할 일정", "date=2026-06-12", "color=#ff9f0a");
                    return true;
                }),
                isNull()
        );
    }

    @Test
    void recurringScheduleAndExceptionActionsWriteAdminAuditLogs() {
        RecurringScheduleRequest request = new RecurringScheduleRequest(
                "정기 회의",
                null,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 30),
                List.of("MONDAY"),
                "18:00",
                "19:00",
                null,
                "MEETING",
                "#8e5cf7"
        );
        when(recurringScheduleService.create(request, "2026000001"))
                .thenReturn(recurringResponse(7L, "정기 회의", "#8e5cf7"));

        recurringScheduleController.create(request, new TestingAuthenticationToken("2026000001", "password"));

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_RECURRING_SCHEDULE_CREATE"),
                eq("RECURRING_SCHEDULE"),
                eq("7"),
                argThat(detail -> {
                    assertThat(detail).contains("title=정기 회의", "color=#8e5cf7");
                    return true;
                }),
                isNull()
        );

        RecurringScheduleExceptionRequest exceptionRequest = new RecurringScheduleExceptionRequest(true, null, null);
        when(recurringScheduleService.upsertException(7L, LocalDate.of(2026, 6, 8), exceptionRequest))
                .thenReturn(new RecurringScheduleExceptionResponse(
                        9L,
                        7L,
                        LocalDate.of(2026, 6, 8),
                        true,
                        null,
                        null,
                        LocalDateTime.now(),
                        LocalDateTime.now()
                ));

        recurringScheduleController.upsertException(7L, LocalDate.of(2026, 6, 8), exceptionRequest,
                new TestingAuthenticationToken("2026000001", "password"));

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_RECURRING_SCHEDULE_EXCEPTION_UPSERT"),
                eq("RECURRING_SCHEDULE"),
                eq("7"),
                argThat(detail -> {
                    assertThat(detail).contains("date=2026-06-08", "canceled=true");
                    return true;
                }),
                isNull()
        );
    }

    private ClubActivityResponse activityResponse(Long id, String kind, String title, String colorHex) {
        return new ClubActivityResponse(
                id,
                kind,
                "GENERAL",
                "일반",
                title,
                null,
                LocalDate.of(2026, 6, 11),
                LocalDate.of(2026, 6, 11),
                "18:30",
                "19:30",
                colorHex,
                null,
                null,
                List.of(),
                List.of(),
                "관리자",
                0,
                0,
                0,
                LocalDateTime.now(),
                LocalDateTime.now()
        );
    }

    private RecurringScheduleResponse recurringResponse(Long id, String title, String colorHex) {
        return new RecurringScheduleResponse(
                id,
                title,
                null,
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 30),
                List.of("MONDAY"),
                "18:00",
                "19:00",
                null,
                "MEETING",
                "회의",
                colorHex,
                "관리자",
                LocalDateTime.now(),
                LocalDateTime.now()
        );
    }
}
