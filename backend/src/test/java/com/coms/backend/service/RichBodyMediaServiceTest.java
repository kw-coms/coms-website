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
    private final org.springframework.transaction.PlatformTransactionManager transactions =
            mock(org.springframework.transaction.PlatformTransactionManager.class);
    private final RichBodyMediaService service = new RichBodyMediaService(rows, members, storage, validator,
            Clock.fixed(java.time.Instant.parse("2026-11-06T00:00:00Z"), ZoneOffset.UTC), deleter, transactions);
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

    @Test void repeatedIdsAreResolvedOnlyOnce() {
        RichBodyMedia candidate = row(1, RichBodyMedia.Kind.IMAGE, NOTICE, 100);
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(rows.findLockedById(1L)).thenReturn(Optional.of(candidate));
        service.syncAttachments(NOTICE, 50L, "[" + String.join(",", java.util.Collections.nCopies(200,
                "{\"type\":\"image\",\"mediaId\":1}")) + "]", "actor");
        verify(rows, times(1)).findLockedById(1L);
        verify(members, times(1)).findByStudentId("actor");
        assertThat(candidate.getOwnerId()).isEqualTo(50L);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"{\"type\":\"image\",\"mediaId\":1}", "{\"type\":\"video\",\"url\":\"legacy\"}"})
    void tooManyMediaBlocksFailBeforeAnyDatabaseWork(String block) {
        assertBadAttachment("[" + String.join(",", java.util.Collections.nCopies(201, block)) + "]");
        verifyNoInteractions(rows, members);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"IMAGE,20", "VIDEO,3", "FILE,10"})
    void distinctKindLimitIsAcceptedAndOneOverFailsBeforeDatabaseWork(RichBodyMedia.Kind kind, int limit) {
        String field = kind == RichBodyMedia.Kind.FILE ? "fileId" : "mediaId";
        var blocks = new java.util.ArrayList<String>();
        for (long id = 1; id <= limit; id++) {
            RichBodyMedia candidate = row(id, kind, NOTICE, 100);
            candidate.attach(50L, LocalDateTime.now());
            when(rows.findLockedById(id)).thenReturn(Optional.of(candidate));
            blocks.add("{\"type\":\"" + kind.name().toLowerCase(java.util.Locale.ROOT) + "\",\"" + field + "\":" + id + "}");
        }
        service.syncAttachments(NOTICE, 50L, "[" + String.join(",", blocks) + "]", null);
        verify(rows, times(limit)).findLockedById(anyLong());
        clearInvocations(rows, members);
        blocks.add("{\"type\":\"" + kind.name().toLowerCase(java.util.Locale.ROOT) + "\",\"" + field + "\":" + (limit + 1) + "}");
        assertBadAttachment("[" + String.join(",", blocks) + "]");
        verifyNoInteractions(rows, members);
    }

    @Test void sameIdWithConflictingKindsIsRejectedBeforeDatabaseWork() {
        assertBadAttachment("[{\"type\":\"image\",\"mediaId\":1},{\"type\":\"video\",\"mediaId\":1}]");
        verifyNoInteractions(rows, members);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"USER,30,0", "ADMIN,30,0", "USER,0,524288000", "ADMIN,0,524288000"})
    void pendingQuotaDeletesStoredFileAfterUnlocking(Member.Role role, long count, long bytes) throws Exception {
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(actor.getRole()).thenReturn(role);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(members.findWithLockById(100L)).thenReturn(Optional.of(actor));
        when(rows.countByUploaderIdAndOwnerIdIsNull(100L)).thenReturn(0L, count);
        when(rows.sumPendingBytes(100L)).thenReturn(0L, bytes);
        var file = new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf", new byte[]{1});
        when(validator.validateFile(file)).thenReturn("application/pdf");
        when(storage.store(file, "pdf")).thenReturn("stored.pdf");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode().value()).isEqualTo(429);
                    assertThat(error.getReason()).isEqualTo("저장하지 않은 업로드가 너무 많습니다. 글을 저장하거나 잠시 후 다시 시도해 주세요.");
                });
        var order = inOrder(validator, storage, transactions, members, rows);
        order.verify(validator).validateFile(file);
        order.verify(storage).store(file, "pdf");
        order.verify(transactions).getTransaction(any());
        order.verify(members).findWithLockById(100L);
        order.verify(rows).countByUploaderIdAndOwnerIdIsNull(100L);
        order.verify(transactions).rollback(any());
        order.verify(storage).delete("stored.pdf");
        verify(rows, never()).saveAndFlush(any());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"30,0", "0,524288000"})
    void preCheckOverQuotaStoresNothing(long count, long bytes) throws Exception {
        var file = prepareUpload();
        when(rows.countByUploaderIdAndOwnerIdIsNull(100L)).thenReturn(count);
        when(rows.sumPendingBytes(100L)).thenReturn(bytes);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode().value()).isEqualTo(429);
                    assertThat(error.getReason()).isEqualTo("저장하지 않은 업로드가 너무 많습니다. 글을 저장하거나 잠시 후 다시 시도해 주세요.");
                });
        verifyNoInteractions(storage, transactions);
        verify(members, never()).findWithLockById(anyLong());
        verify(rows, never()).saveAndFlush(any());
    }

    @Test void saveFailureDeletesStoredFileAndPropagatesOriginalException() throws Exception {
        var file = prepareUpload();
        var failure = new IllegalStateException("database unavailable");
        when(rows.saveAndFlush(any())).thenThrow(failure);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isSameAs(failure);
        var order = inOrder(transactions, storage);
        order.verify(transactions).rollback(any());
        order.verify(storage).delete("stored.pdf");
    }

    @Test void memberMissingInsideTransactionDeletesStoredFile() throws Exception {
        var file = prepareUpload();
        when(members.findWithLockById(100L)).thenReturn(Optional.empty());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(401));
        var order = inOrder(transactions, storage);
        order.verify(transactions).rollback(any());
        order.verify(storage).delete("stored.pdf");
        verify(rows, never()).saveAndFlush(any());
    }

    @Test void cleanupFailureIsSuppressedOnOriginalException() throws Exception {
        var file = prepareUpload();
        var failure = new IllegalStateException("database unavailable");
        var deletionFailure = new IllegalStateException("disk unavailable");
        when(rows.saveAndFlush(any())).thenThrow(failure);
        doThrow(deletionFailure).when(storage).delete("stored.pdf");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isSameAs(failure);
        assertThat(failure.getSuppressed()).containsExactly(deletionFailure);
        verify(storage).delete("stored.pdf");
    }

    private org.springframework.mock.web.MockMultipartFile prepareUpload() throws Exception {
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(members.findWithLockById(100L)).thenReturn(Optional.of(actor));
        var file = new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf", new byte[]{1});
        when(validator.validateFile(file)).thenReturn("application/pdf");
        when(storage.store(file, "pdf")).thenReturn("stored.pdf");
        return file;
    }

    @Test void exactPendingByteLimitAndThirtiethUploadAreAllowed() throws Exception {
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(members.findWithLockById(100L)).thenReturn(Optional.of(actor));
        when(rows.countByUploaderIdAndOwnerIdIsNull(100L)).thenReturn(29L);
        when(rows.sumPendingBytes(100L)).thenReturn(524288000L - 1);
        var file = new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf", new byte[]{1});
        when(validator.validateFile(file)).thenReturn("application/pdf");
        when(storage.store(file, "pdf")).thenReturn("stored.pdf");
        when(rows.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor").getOriginalName()).isEqualTo("a.pdf");
        var order = inOrder(storage, transactions, members, rows);
        order.verify(storage).store(file, "pdf");
        order.verify(transactions).getTransaction(any());
        order.verify(members).findWithLockById(100L);
        order.verify(rows).countByUploaderIdAndOwnerIdIsNull(100L);
        order.verify(rows).sumPendingBytes(100L);
        order.verify(rows).saveAndFlush(any());
        order.verify(transactions).commit(any());
        verify(storage, never()).delete(any());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"IMAGE,image/jpeg,jpg", "IMAGE,image/png,png", "IMAGE,image/gif,gif", "IMAGE,image/webp,webp",
            "VIDEO,video/mp4,mp4", "VIDEO,video/webm,webm", "VIDEO,video/quicktime,mov"})
    void downloadNameUsesValidatedType(RichBodyMedia.Kind kind, String type, String extension) throws Exception {
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(members.findWithLockById(100L)).thenReturn(Optional.of(actor));
        var file = new org.springframework.mock.web.MockMultipartFile("file", "x.html", type, new byte[]{1});
        when(validator.validateImage(file)).thenReturn(type);
        when(validator.validateVideo(file)).thenReturn(type);
        when(rows.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.upload(NOTICE, kind, file, "actor").getOriginalName()).isEqualTo("x." + extension);
        if (kind == RichBodyMedia.Kind.IMAGE) verify(storage).storeImage(file, type, extension);
        else verify(storage).store(file, extension);
    }

    @Test void originalNameTooLongIsRejectedBeforeStorage() {
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(members.findWithLockById(100L)).thenReturn(Optional.of(actor));
        var file = new org.springframework.mock.web.MockMultipartFile("file", "가".repeat(252) + ".pdf", "application/pdf", new byte[]{1});
        when(validator.validateFile(file)).thenReturn("application/pdf");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, RichBodyMedia.Kind.FILE, file, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(storage, rows, transactions);
        verify(members, never()).findWithLockById(anyLong());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(RichBodyMedia.Kind.class)
    void invalidUploadReturns400BeforeQuotaAndStoresNothing(RichBodyMedia.Kind kind) {
        var file = new org.springframework.mock.web.MockMultipartFile("file", "bad.pdf", "application/pdf", new byte[]{1});
        var failure = new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST);
        when(validator.validateImage(file)).thenThrow(failure);
        when(validator.validateVideo(file)).thenThrow(failure);
        when(validator.validateFile(file)).thenThrow(failure);
        Member actor = mock(Member.class);
        when(actor.getId()).thenReturn(100L);
        when(members.findByStudentId("actor")).thenReturn(Optional.of(actor));
        when(rows.countByUploaderIdAndOwnerIdIsNull(100L)).thenReturn(30L);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.upload(NOTICE, kind, file, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(storage, rows, transactions);
        verify(members, never()).findWithLockById(anyLong());
    }

    @Test void locksDeduplicatedReferencesInAscendingIdOrder() {
        for (long id : new long[]{1, 2, 3}) {
            var media = row(id, RichBodyMedia.Kind.IMAGE, NOTICE, 100);
            media.attach(50L, LocalDateTime.now());
            when(rows.findLockedById(id)).thenReturn(Optional.of(media));
        }
        service.syncAttachments(NOTICE, 50L,
                "[{\"type\":\"image\",\"mediaId\":3},{\"type\":\"image\",\"mediaId\":1},"
                + "{\"type\":\"image\",\"mediaId\":3},{\"type\":\"image\",\"mediaId\":2}]", null);
        var order = inOrder(rows);
        order.verify(rows).findLockedById(1L);
        order.verify(rows).findLockedById(2L);
        order.verify(rows).findLockedById(3L);
        order.verify(rows).findByScopeAndOwnerId(NOTICE, 50L);
        order.verifyNoMoreInteractions();
    }

    @Test void detachesRemovedRowsInAscendingIdOrder() {
        var first = spy(row(1, RichBodyMedia.Kind.IMAGE, NOTICE, 100));
        var second = spy(row(2, RichBodyMedia.Kind.IMAGE, NOTICE, 100));
        var third = spy(row(3, RichBodyMedia.Kind.IMAGE, NOTICE, 100));
        for (var media : List.of(first, second, third)) media.attach(50L, LocalDateTime.now());
        when(rows.findByScopeAndOwnerId(NOTICE, 50L)).thenReturn(List.of(third, first, second));

        service.syncAttachments(NOTICE, 50L, "[]", null);

        var order = inOrder(first, second, third);
        order.verify(first).detach();
        order.verify(second).detach();
        order.verify(third).detach();
    }

    private void assertBadAttachment(String content) {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.syncAttachments(NOTICE, 50L, content, "actor"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
    }

    private static String image(long id) { return "[{\"type\":\"image\",\"mediaId\":" + id + "}]"; }

    private static RichBodyMedia row(long id, RichBodyMedia.Kind kind, RichBodyMedia.Scope scope, long uploaderId) {
        RichBodyMedia result = new RichBodyMedia(kind, scope, "stored-" + id, "photo.png", "image/png", 10, uploaderId);
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }
}
