package com.coms.backend.service;

import com.coms.backend.domain.SponsorImage;
import com.coms.backend.repository.SponsorImageRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Deletes a {@code sponsor_images} row and its backing file.
 *
 * <p>The row is deleted immediately, joining whatever transaction is already open, but the
 * physical file delete is deferred to run only after that transaction commits — an eager
 * {@code storageService.delete()} followed by a rollback would leave the row pointing at a file
 * that no longer exists. Outside a transaction (no active synchronization) the file is removed
 * immediately, matching the old behaviour.
 *
 * <p>This lives in its own bean, separate from {@link SponsorService}, so that
 * {@link #deleteOrphanInOwnTransaction(Long)} can be {@code @Transactional(REQUIRES_NEW)} — a
 * caller looping over orphaned rows within its own transaction (e.g.
 * {@code SponsorService.deleteOrphanedImagesOlderThan}) must call this through the Spring proxy
 * of a *different* bean for the propagation to take effect; self-invocation would silently join
 * the caller's transaction instead.
 */
@Component
class SponsorImageDeleter {

    private final SponsorImageRepository imageRepository;
    private final StorageService storageService;

    SponsorImageDeleter(SponsorImageRepository imageRepository, StorageService storageService) {
        this.imageRepository = imageRepository;
        this.storageService = storageService;
    }

    void delete(SponsorImage image) {
        String storedName = SponsorService.storedName(image);
        imageRepository.delete(image);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    storageService.delete(storedName);
                }
            });
        } else {
            storageService.delete(storedName);
        }
    }

    /**
     * Retention-job entry point: deletes one orphaned image in a brand-new transaction so a
     * failure on this row cannot roll back — or abort processing of — the rest of the batch.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deleteOrphanInOwnTransaction(Long imageId) {
        imageRepository.findById(imageId).ifPresent(this::delete);
    }
}
