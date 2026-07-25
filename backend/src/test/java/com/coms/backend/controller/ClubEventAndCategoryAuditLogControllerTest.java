package com.coms.backend.controller;

import com.coms.backend.domain.ClubEventEntry;
import com.coms.backend.dto.ClubActivityCategoryRequest;
import com.coms.backend.dto.ClubActivityCategoryResponse;
import com.coms.backend.dto.ClubEventRequest;
import com.coms.backend.dto.ClubEventResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubActivityCategoryService;
import com.coms.backend.service.ClubEventService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClubEventAndCategoryAuditLogControllerTest {

    private final ClubEventService clubEventService = mock(ClubEventService.class);
    private final ClubActivityCategoryService categoryService = mock(ClubActivityCategoryService.class);
    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final ClubEventController eventController = new ClubEventController(clubEventService, auditLogService);
    private final ClubActivityCategoryController categoryController = new ClubActivityCategoryController(categoryService, auditLogService);

    @Test
    void eventCreateUpdateAndDeleteWriteReadableAdminAuditLogs() {
        LocalDateTime startsAt = LocalDateTime.of(2026, 7, 25, 18, 0);
        LocalDateTime endsAt = LocalDateTime.of(2026, 7, 25, 20, 0);
        ClubEventRequest createRequest = new ClubEventRequest("여름 회지전", "회지 공개", startsAt, endsAt);
        when(clubEventService.createEvent("여름 회지전", "회지 공개", startsAt, endsAt, "2026000001"))
                .thenReturn(eventResponse(51L, "여름 회지전", "회지 공개", startsAt, endsAt, 2));

        eventController.create(createRequest, auth());

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_EVENT_CREATE"),
                eq("CLUB_EVENT"),
                eq("51"),
                argThat(detail -> {
                    assertThat(detail).contains("title=여름 회지전", "startsAt=2026-07-25T18:00", "endsAt=2026-07-25T20:00");
                    return true;
                }),
                isNull()
        );

        ClubEventRequest updateRequest = new ClubEventRequest("가을 회지전", "수정된 설명", startsAt, endsAt);
        when(clubEventService.updateEvent(51L, "가을 회지전", "수정된 설명", startsAt, endsAt, "2026000001"))
                .thenReturn(eventResponse(51L, "가을 회지전", "수정된 설명", startsAt, endsAt, 2));

        eventController.update(51L, updateRequest, auth());

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_EVENT_UPDATE"),
                eq("CLUB_EVENT"),
                eq("51"),
                argThat(detail -> {
                    assertThat(detail).contains("title=가을 회지전", "description=수정된 설명", "entryCount=2");
                    return true;
                }),
                isNull()
        );

        when(clubEventService.get(51L, "2026000001"))
                .thenReturn(eventResponse(51L, "삭제될 회지전", "삭제 전 설명", startsAt, endsAt, 3));

        eventController.deleteEvent(51L, auth());

        verify(clubEventService).deleteEvent(51L);
        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_EVENT_DELETE"),
                eq("CLUB_EVENT"),
                eq("51"),
                argThat(detail -> {
                    assertThat(detail).contains("title=삭제될 회지전", "description=삭제 전 설명", "entryCount=3");
                    return true;
                }),
                isNull()
        );
    }

    @Test
    void eventEntryCreateAndDeleteWriteReadableAdminAuditLogs() {
        MockMultipartFile file = new MockMultipartFile("files", "entry.pdf", "application/pdf", "%PDF".getBytes());
        when(clubEventService.addEntry(
                eq(61L),
                eq("봄호"),
                eq("편집팀"),
                eq("봄 활동 정리"),
                eq("MAGAZINE"),
                eq("한줄 소개"),
                eq("봄,회지"),
                eq("https://coms.kw.ac.kr/archive/spring"),
                eq(List.of(file)),
                eq("2026000001")
        )).thenReturn(entryResponse(71L, "봄호", "편집팀", "MAGAZINE", "entry.pdf"));

        eventController.addEntry(
                61L,
                "봄호",
                "편집팀",
                "봄 활동 정리",
                "MAGAZINE",
                "한줄 소개",
                "봄,회지",
                "https://coms.kw.ac.kr/archive/spring",
                List.of(file),
                null,
                auth()
        );

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_EVENT_ENTRY_CREATE"),
                eq("CLUB_EVENT_ENTRY"),
                eq("71"),
                argThat(detail -> {
                    assertThat(detail).contains("eventId=61", "title=봄호", "author=편집팀", "workType=MAGAZINE");
                    return true;
                }),
                isNull()
        );

        ClubEventEntry entry = mock(ClubEventEntry.class);
        when(entry.getId()).thenReturn(71L);
        when(entry.getClubEventId()).thenReturn(61L);
        when(entry.getTitle()).thenReturn("삭제할 봄호");
        when(entry.getAuthorName()).thenReturn("편집팀");
        when(entry.getWorkType()).thenReturn("MAGAZINE");
        when(entry.getOriginalName()).thenReturn("old-entry.pdf");
        when(clubEventService.loadEntryMeta(61L, 71L)).thenReturn(entry);

        eventController.deleteEntry(61L, 71L, auth());

        verify(clubEventService).deleteEntry(61L, 71L);
        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_EVENT_ENTRY_DELETE"),
                eq("CLUB_EVENT_ENTRY"),
                eq("71"),
                argThat(detail -> {
                    assertThat(detail).contains("eventId=61", "title=삭제할 봄호", "author=편집팀", "file=old-entry.pdf");
                    return true;
                }),
                isNull()
        );
    }

    @Test
    void activityCategoryCreateUpdateAndDeleteWriteReadableAdminAuditLogs() {
        ClubActivityCategoryRequest createRequest = new ClubActivityCategoryRequest("STUDY", "스터디", 3);
        when(categoryService.create(createRequest))
                .thenReturn(new ClubActivityCategoryResponse(81L, "STUDY", "스터디", 3, 0));

        categoryController.create(createRequest, auth());

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_ACTIVITY_CATEGORY_CREATE"),
                eq("CLUB_ACTIVITY_CATEGORY"),
                eq("81"),
                argThat(detail -> {
                    assertThat(detail).contains("key=STUDY", "name=스터디", "position=3");
                    return true;
                }),
                isNull()
        );

        ClubActivityCategoryRequest updateRequest = new ClubActivityCategoryRequest(null, "프로젝트 발표", 4);
        when(categoryService.update(81L, updateRequest))
                .thenReturn(new ClubActivityCategoryResponse(81L, "STUDY", "프로젝트 발표", 4, 5));

        categoryController.update(81L, updateRequest, auth());

        verify(auditLogService).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_ACTIVITY_CATEGORY_UPDATE"),
                eq("CLUB_ACTIVITY_CATEGORY"),
                eq("81"),
                argThat(detail -> {
                    assertThat(detail).contains("key=STUDY", "name=프로젝트 발표", "activityCount=5");
                    return true;
                }),
                isNull()
        );

        when(categoryService.get(81L))
                .thenReturn(new ClubActivityCategoryResponse(81L, "STUDY", "삭제할 분류", 4, 0));

        categoryController.delete(81L, auth());

        verify(categoryService).delete(81L);
        verify(auditLogService, times(1)).record(
                eq("2026000001"),
                eq("ADMIN_CLUB_ACTIVITY_CATEGORY_DELETE"),
                eq("CLUB_ACTIVITY_CATEGORY"),
                eq("81"),
                argThat(detail -> {
                    assertThat(detail).contains("key=STUDY", "name=삭제할 분류", "position=4");
                    return true;
                }),
                isNull()
        );
    }

    private TestingAuthenticationToken auth() {
        return new TestingAuthenticationToken("2026000001", "password");
    }

    private ClubEventResponse eventResponse(Long id,
                                            String title,
                                            String description,
                                            LocalDateTime startsAt,
                                            LocalDateTime endsAt,
                                            int entryCount) {
        return new ClubEventResponse(
                id,
                title,
                description,
                startsAt,
                endsAt,
                true,
                0,
                null,
                entryCount,
                List.of(),
                0,
                0,
                0,
                null,
                "관리자",
                LocalDateTime.now(),
                LocalDateTime.now()
        );
    }

    private ClubEventResponse.Entry entryResponse(Long id,
                                                  String title,
                                                  String authorName,
                                                  String workType,
                                                  String originalName) {
        return new ClubEventResponse.Entry(
                id,
                title,
                authorName,
                null,
                workType,
                null,
                null,
                null,
                "/api/club-events/61/entries/" + id + "/download",
                originalName,
                "application/pdf",
                4,
                List.of(),
                0,
                false,
                1,
                LocalDateTime.now()
        );
    }
}
