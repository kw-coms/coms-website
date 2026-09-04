package com.coms.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;

/** Deletes abandoned sponsor uploads after their 24-hour editing grace period. */
@Service
public class SponsorImageRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(SponsorImageRetentionJob.class);
    private static final int RETENTION_HOURS = 24;

    private final SponsorService sponsorService;
    private final Clock clock;
    private final boolean enabled;

    public SponsorImageRetentionJob(SponsorService sponsorService,
                                    Clock clock,
                                    @Value("${coms.retention.enabled:true}") boolean enabled) {
        this.sponsorService = sponsorService;
        this.clock = clock;
        this.enabled = enabled;
    }

    /**
     * Not itself {@code @Transactional} — {@code SponsorService.deleteOrphanedImagesOlderThan}
     * only reads under its own read-only transaction, and each row it deletes runs in its own
     * {@code REQUIRES_NEW} transaction (see {@link SponsorImageDeleter}) so one bad row cannot
     * abort the rest of the batch.
     */
    @Scheduled(cron = "${coms.retention.sponsor-images-cron:0 50 4 * * *}", zone = "Asia/Seoul")
    public void purgeOrphanedSponsorImages() {
        if (!enabled) {
            log.debug("Retention purge disabled (coms.retention.enabled=false) — skipping sponsor images.");
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(clock).minusHours(RETENTION_HOURS);
        int deleted = sponsorService.deleteOrphanedImagesOlderThan(cutoff);
        log.info("Purged {} unreferenced sponsor_images rows created before {}", deleted, cutoff);
    }
}
