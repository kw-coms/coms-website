package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RichBodyMediaRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RichBodyMediaServiceTest {
    private final RichBodyMediaRepository rows = mock(RichBodyMediaRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final StorageService storage = mock(StorageService.class);
    private final MediaUploadValidator validator = mock(MediaUploadValidator.class);
    private final RichBodyMediaDeleter deleter = mock(RichBodyMediaDeleter.class);
    private final RichBodyMediaService service = new RichBodyMediaService(rows, members, storage, validator,
            Clock.fixed(java.time.Instant.parse("2026-11-06T00:00:00Z"), ZoneOffset.UTC), deleter);
    private static final RichBodyMedia.Scope NOTICE = RichBodyMedia.Scope.NOTICE;

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"0", "-1", "1.5", "\"1\"", "9223372036854775808"})
    void rejectsMalformedReferenceIds(String id) {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.syncAttachments(NOTICE, 50L,
                "[{\"type\":\"image\",\"mediaId\":" + id + "}]", "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(rows);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"missing", "scope", "kind", "uploader", "owner", "deletedUploader"})
    void rejectsReferencesThatCannotBeRegistered(String reason) {
        RichBodyMedia candidate = row(1, reason.equals("kind") ? RichBodyMedia.Kind.FILE : RichBodyMedia.Kind.IMAGE,
                reason.equals("scope") ? RichBodyMedia.Scope.SPONSOR : NOTICE, reason.equals("uploader") ? 200 : 100);
        if (reason.equals("owner")) candidate.attach(60L, LocalDateTime.now());
        if (reason.equals("deletedUploader")) ReflectionTestUtils.setField(candidate, "uploaderId", null);
        when(rows.findLockedById(1L)).thenReturn(reason.equals("missing") ? Optional.empty() : Optional.of(candidate));
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.syncAttachments(NOTICE, 50L, image(1), "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode().value()).isEqualTo(400);
                    assertThat(error.getReason()).isEqualTo("첨부할 수 없는 파일이 포함되어 있습니다. 다시 올려 주세요.");
                });
        verify(rows, never()).findByScopeAndOwnerId(any(), any());
        assertThat(candidate.getOwnerId()).isEqualTo(reason.equals("owner") ? 60L : null);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(RichBodyMedia.Kind.class)
    void newPendingAttachesExistingAttachmentStaysAndRemovedDetaches(RichBodyMedia.Kind kind) {
        RichBodyMedia pending = row(1, kind, NOTICE, 100);
        RichBodyMedia retained = row(2, kind, NOTICE, 200);
        RichBodyMedia removed = row(3, kind, NOTICE, 100);
        retained.attach(50L, LocalDateTime.now());
        removed.attach(50L, LocalDateTime.now());
        when(rows.findLockedById(1L)).thenReturn(Optional.of(pending));
        when(rows.findLockedById(2L)).thenReturn(Optional.of(retained));
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of(pending, retained, removed));
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        String field = kind == RichBodyMedia.Kind.FILE ? "fileId" : "mediaId";
        String body = "[{\"type\":\"%s\",\"%s\":1},{\"type\":\"%s\",\"%s\":2}]"
                .formatted(kind.name().toLowerCase(java.util.Locale.ROOT), field, kind.name().toLowerCase(java.util.Locale.ROOT), field);

        service.syncAttachments(NOTICE, 50L, body, "actor");

        assertThat(pending.getOwnerId()).isEqualTo(50L);
        assertThat(pending.getAttachedAt()).isNotNull();
        assertThat(retained.getOwnerId()).isEqualTo(50L);
        assertThat(retained.getAttachedAt()).isNotNull();
        assertThat(removed.getOwnerId()).isNull();
        assertThat(removed.getAttachedAt()).isNull();
    }

    @Test void deletingOwnerDetachesAllItsRows() {
        RichBodyMedia first = row(1, RichBodyMedia.Kind.FILE, NOTICE, 100);
        RichBodyMedia second = row(2, RichBodyMedia.Kind.IMAGE, NOTICE, 100);
        first.attach(50L, LocalDateTime.now());
        second.attach(50L, LocalDateTime.now());
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of(first, second));

        service.detachAttachments(NOTICE, 50L);

        assertThat(first.getOwnerId()).isNull();
        assertThat(second.getOwnerId()).isNull();
        assertThat(first.getAttachedAt()).isNull();
        assertThat(second.getAttachedAt()).isNull();
    }

    @Test void sweepContinuesAfterOneRowFails() {
        RichBodyMedia first = row(1, RichBodyMedia.Kind.FILE, NOTICE, 100);
        RichBodyMedia second = row(2, RichBodyMedia.Kind.FILE, NOTICE, 100);
        LocalDateTime cutoff = LocalDateTime.now().minusHours(24);
        when(rows.findByOwnerIdIsNullAndCreatedAtBefore(cutoff)).thenReturn(List.of(first, second));
        when(deleter.deleteIfStillOrphan(1L, cutoff)).thenThrow(new IllegalStateException("disk unavailable"));
        when(deleter.deleteIfStillOrphan(2L, cutoff)).thenReturn(true);

        assertThat(service.deleteOrphanedOlderThan(cutoff)).isEqualTo(1);
        verify(deleter).deleteIfStillOrphan(2L, cutoff);
    }

    private static String image(long id) { return "[{\"type\":\"image\",\"mediaId\":" + id + "}]"; }

    private static RichBodyMedia row(long id, RichBodyMedia.Kind kind, RichBodyMedia.Scope scope, long uploaderId) {
        RichBodyMedia result = new RichBodyMedia(kind, scope, "stored-" + id, "photo.png", "image/png", 10, uploaderId);
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }
}
