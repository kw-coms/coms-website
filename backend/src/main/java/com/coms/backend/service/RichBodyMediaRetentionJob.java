package com.coms.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class RichBodyMediaRetentionJob {
    private static final Logger log = LoggerFactory.getLogger(RichBodyMediaRetentionJob.class);
    private final RichBodyMediaService media;
    private final Clock clock;
    private final boolean enabled;
    public RichBodyMediaRetentionJob(RichBodyMediaService media, Clock clock,
                                     @Value("${coms.retention.enabled:true}") boolean enabled) {
        this.media = media; this.clock = clock; this.enabled = enabled;
    }
    @Scheduled(cron = "${coms.retention.rich-body-media-cron:0 55 4 * * *}", zone = "Asia/Seoul")
    public void purgeOrphans() {
        if (!enabled) return;
        LocalDateTime cutoff = LocalDateTime.now(clock).minusHours(24);
        log.info("Purged {} unreferenced rich body uploads", media.deleteOrphanedOlderThan(cutoff));
    }
}
