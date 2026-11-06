package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.RichBodyMediaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

/** Rechecks an orphan under a row lock so a concurrent save cannot lose its media. */
@Service
class RichBodyMediaDeleter {
    private final RichBodyMediaRepository repository;
    private final StorageService storage;
    RichBodyMediaDeleter(RichBodyMediaRepository repository, StorageService storage) {
        this.repository = repository; this.storage = storage;
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean deleteIfStillOrphan(Long id, LocalDateTime cutoff) {
        var locked = repository.findLockedById(id);
        if (locked.isEmpty()) return false;
        RichBodyMedia row = locked.get();
        if (row.getOwnerId() != null || !row.getCreatedAt().isBefore(cutoff)) return false;
        storage.delete(row.getStoredName());
        repository.delete(row);
        return true;
    }
}
