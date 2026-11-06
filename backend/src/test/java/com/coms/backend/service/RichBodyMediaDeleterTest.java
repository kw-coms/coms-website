package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.RichBodyMediaRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RichBodyMediaDeleterTest {
    private final RichBodyMediaRepository repository = mock(RichBodyMediaRepository.class);
    private final StorageService storage = mock(StorageService.class);
    private final RichBodyMediaDeleter deleter = new RichBodyMediaDeleter(repository, storage);
    private final LocalDateTime cutoff = LocalDateTime.now().minusHours(24);

    @Test void removesOnlyOldUnattachedRows() {
        var old = media(1L, cutoff.minusSeconds(1));
        var recent = media(2L, cutoff);
        var attached = media(3L, cutoff.minusSeconds(1));
        attached.attach(99L, LocalDateTime.now());
        when(repository.findLockedById(1L)).thenReturn(Optional.of(old));
        when(repository.findLockedById(2L)).thenReturn(Optional.of(recent));
        when(repository.findLockedById(3L)).thenReturn(Optional.of(attached));

        assertThat(deleter.deleteIfStillOrphan(1L, cutoff, cutoff)).isTrue();
        assertThat(deleter.deleteIfStillOrphan(2L, cutoff, cutoff)).isFalse();
        assertThat(deleter.deleteIfStillOrphan(3L, cutoff, cutoff)).isFalse();
        verify(storage).delete("stored-1");
        verify(repository).delete(old);
        verify(storage, never()).delete("stored-2");
        verify(storage, never()).delete("stored-3");
    }

    @Test void deletesFileOnlyAfterCommit() {
        var old = media(4L, cutoff.minusSeconds(1));
        when(repository.findLockedById(4L)).thenReturn(Optional.of(old));
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(deleter.deleteIfStillOrphan(4L, cutoff, cutoff)).isTrue();
            verify(repository).delete(old);
            verify(storage, never()).delete(anyString());
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
            verify(storage).delete("stored-4");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test void rechecksDetachmentAgeUnderLock() {
        var recent = media(7L, cutoff.minusDays(30));
        recent.attach(99L, cutoff.minusDays(29));
        recent.detach(cutoff.plusHours(23));
        var expired = media(8L, cutoff.minusDays(30));
        expired.attach(99L, cutoff.minusDays(29));
        expired.detach(cutoff.minusSeconds(1));
        var boundary = media(9L, cutoff.minusDays(30));
        boundary.attach(99L, cutoff.minusDays(29));
        boundary.detach(cutoff);
        when(repository.findLockedById(7L)).thenReturn(Optional.of(recent));
        when(repository.findLockedById(8L)).thenReturn(Optional.of(expired));
        when(repository.findLockedById(9L)).thenReturn(Optional.of(boundary));

        assertThat(deleter.deleteIfStillOrphan(7L, cutoff, cutoff)).isFalse();
        assertThat(deleter.deleteIfStillOrphan(8L, cutoff, cutoff)).isTrue();
        assertThat(deleter.deleteIfStillOrphan(9L, cutoff, cutoff)).isFalse();
        verify(repository).delete(expired);
        verify(repository, never()).delete(recent);
        verify(repository, never()).delete(boundary);
        verify(storage).delete("stored-8");
        verifyNoMoreInteractions(storage);
    }

    @Test void reattachedCandidateSurvivesLockedRecheck() {
        var row = media(10L, cutoff.minusDays(30));
        row.attach(99L, cutoff.minusDays(29));
        row.detach(cutoff.minusSeconds(1));
        row.attach(99L, cutoff.plusHours(23));
        when(repository.findLockedById(10L)).thenReturn(Optional.of(row));

        assertThat(row.getDetachedAt()).isNull();
        assertThat(deleter.deleteIfStillOrphan(10L, cutoff, cutoff)).isFalse();
        verify(repository, never()).delete(any());
        verifyNoInteractions(storage);
    }

    @Test void keepsFileWhenTransactionDoesNotCommit() {
        var old = media(5L, cutoff.minusSeconds(1));
        when(repository.findLockedById(5L)).thenReturn(Optional.of(old));
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(deleter.deleteIfStillOrphan(5L, cutoff, cutoff)).isTrue();
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCompletion(1));
            verify(storage, never()).delete(anyString());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test void failedAfterCommitDeleteLogsStoredNameAtError() {
        var old = media(6L, cutoff.minusSeconds(1));
        when(repository.findLockedById(6L)).thenReturn(Optional.of(old));
        doThrow(new IllegalStateException("disk unavailable")).when(storage).delete("stored-6");
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(RichBodyMediaDeleter.class);
        var appender = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(deleter.deleteIfStillOrphan(6L, cutoff, cutoff)).isTrue();
            verifyNoInteractions(storage);
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
            assertThat(appender.list).singleElement().satisfies(event -> {
                assertThat(event.getLevel()).isEqualTo(ch.qos.logback.classic.Level.ERROR);
                assertThat(event.getFormattedMessage()).contains("stored-6");
            });
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    private RichBodyMedia media(Long id, LocalDateTime createdAt) {
        var row = new RichBodyMedia(RichBodyMedia.Kind.FILE, RichBodyMedia.Scope.ARCHIVE,
                "stored-" + id, "original.pdf", "application/pdf", 1, 7L, createdAt);
        ReflectionTestUtils.setField(row, "id", id);
        ReflectionTestUtils.setField(row, "createdAt", createdAt);
        return row;
    }
}
