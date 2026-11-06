package com.coms.backend.service;

import com.coms.backend.domain.RichBodyMedia;
import com.coms.backend.repository.RichBodyMediaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.LocalDateTime;

/** Rechecks an orphan under a row lock so a concurrent save cannot lose its media. */
@Service
class RichBodyMediaDeleter {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RichBodyMediaDeleter.class);
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
        repository.delete(row);
        String storedName = row.getStoredName();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { deleteBestEffort(storedName); }
            });
        } else {
            deleteBestEffort(storedName);
        }
        return true;
    }

    private void deleteBestEffort(String storedName) {
        try { storage.delete(storedName); }
        catch (RuntimeException e) { log.warn("Could not delete orphan rich media file {}", storedName, e); }
    }
}
