package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.RichBodyMediaRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
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

    private RichBodyMedia media(Long id, LocalDateTime createdAt) {
        var row = new RichBodyMedia(RichBodyMedia.Kind.FILE, RichBodyMedia.Scope.ARCHIVE,
                "stored-" + id, "original.pdf", "application/pdf", 1, 7L);
        ReflectionTestUtils.setField(row, "id", id);
        ReflectionTestUtils.setField(row, "createdAt", createdAt);
        return row;
    }
}
