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

    @Test void pendingUploadBelongingToAnotherMemberCannotBeAttached() {
        RichBodyMedia foreign = row(1, RichBodyMedia.Kind.IMAGE, NOTICE, 200);
        when(rows.findLockedById(1L)).thenReturn(Optional.of(foreign));
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of());
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));

        service.syncAttachments(NOTICE, 50L, image(1), "actor");

        assertThat(foreign.getOwnerId()).isNull();
        assertThat(foreign.getAttachedAt()).isNull();
    }

    @Test void existingOtherOwnerCannotBeStolenButSameOwnerSurvivesEdit() {
        RichBodyMedia stolen = row(1, RichBodyMedia.Kind.IMAGE, NOTICE, 100);
        stolen.attach(60L, LocalDateTime.now());
        RichBodyMedia retained = row(2, RichBodyMedia.Kind.IMAGE, NOTICE, 200);
        retained.attach(50L, LocalDateTime.now());
        when(rows.findLockedById(1L)).thenReturn(Optional.of(stolen));
        when(rows.findLockedById(2L)).thenReturn(Optional.of(retained));
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of(retained));

        service.syncAttachments(NOTICE, 50L, "[{\"type\":\"image\",\"mediaId\":1},{\"type\":\"image\",\"mediaId\":2}]", "actor");

        assertThat(stolen.getOwnerId()).isEqualTo(60L);
        assertThat(retained.getOwnerId()).isEqualTo(50L);
        assertThat(retained.getAttachedAt()).isNotNull();
        verifyNoInteractions(members);
    }

    @Test void wrongScopeAndKindAreIgnoredAndRemovedReferenceIsDetached() {
        RichBodyMedia otherScope = row(1, RichBodyMedia.Kind.IMAGE, RichBodyMedia.Scope.SPONSOR, 100);
        RichBodyMedia wrongKind = row(2, RichBodyMedia.Kind.FILE, NOTICE, 100);
        RichBodyMedia removed = row(3, RichBodyMedia.Kind.IMAGE, NOTICE, 100);
        removed.attach(50L, LocalDateTime.now());
        when(rows.findLockedById(1L)).thenReturn(Optional.of(otherScope));
        when(rows.findLockedById(2L)).thenReturn(Optional.of(wrongKind));
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of(removed));

        service.syncAttachments(NOTICE, 50L,
                "[{\"type\":\"image\",\"mediaId\":1},{\"type\":\"image\",\"mediaId\":2}]", "actor");

        assertThat(otherScope.getOwnerId()).isNull();
        assertThat(wrongKind.getOwnerId()).isNull();
        assertThat(removed.getOwnerId()).isNull();
        assertThat(removed.getAttachedAt()).isNull();
        verifyNoInteractions(members);
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
