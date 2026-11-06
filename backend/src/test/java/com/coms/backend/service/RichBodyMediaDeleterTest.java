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

        assertThat(deleter.deleteIfStillOrphan(1L, cutoff)).isTrue();
        assertThat(deleter.deleteIfStillOrphan(2L, cutoff)).isFalse();
        assertThat(deleter.deleteIfStillOrphan(3L, cutoff)).isFalse();
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
            assertThat(deleter.deleteIfStillOrphan(4L, cutoff)).isTrue();
            verify(repository).delete(old);
            verify(storage, never()).delete(anyString());
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
            verify(storage).delete("stored-4");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test void keepsFileWhenTransactionDoesNotCommit() {
        var old = media(5L, cutoff.minusSeconds(1));
        when(repository.findLockedById(5L)).thenReturn(Optional.of(old));
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThat(deleter.deleteIfStillOrphan(5L, cutoff)).isTrue();
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
            assertThat(deleter.deleteIfStillOrphan(6L, cutoff)).isTrue();
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
                "stored-" + id, "original.pdf", "application/pdf", 1, 7L);
        ReflectionTestUtils.setField(row, "id", id);
        ReflectionTestUtils.setField(row, "createdAt", createdAt);
        return row;
    }
}
