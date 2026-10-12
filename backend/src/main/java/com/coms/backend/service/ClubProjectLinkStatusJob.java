package com.coms.backend.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs {@link ClubProjectLinkStatusService#checkAll()} two minutes after start and then every
 * ten minutes. It exists only where {@code coms.project-links.enabled} is true (the prod
 * profile sets it), so tests and a developer's machine make no requests to the outside; the
 * two minutes keep a short-lived start (the image check in CI) from making any either.
 */
@Component
@ConditionalOnProperty(name = "coms.project-links.enabled", havingValue = "true")
public class ClubProjectLinkStatusJob {
    private final ClubProjectLinkStatusService service;

    public ClubProjectLinkStatusJob(ClubProjectLinkStatusService service) {
        this.service = service;
    }

    @Scheduled(initialDelayString = "${coms.project-links.initial-delay:PT2M}", fixedDelayString = "${coms.project-links.interval:PT10M}")
    public void check() {
        service.checkAll();
    }
}
