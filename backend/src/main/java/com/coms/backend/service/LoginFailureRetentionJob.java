package com.coms.backend.service;

import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.RefreshSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * Deletes auth bookkeeping rows past their retention window.
 *
 * <p>{@code login_failures} grows with every failed login and is only ever read over a 15-minute
 * lockout window, so nothing older than a month has any use — but the repository's
 * {@code deleteOlderThan} had no caller, leaving the table to grow without bound (and to hold IP
 * addresses far longer than needed).
 *
 * <p>The same job also prunes {@code refresh_sessions}: once a row is expired or revoked it can
 * never authorize anything again, and only a short tail is worth keeping for incident forensics.
 */
@Service
public class LoginFailureRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(LoginFailureRetentionJob.class);
    private static final int RETENTION_DAYS = 30;
    private static final int REFRESH_SESSION_RETENTION_DAYS = 7;

    private final LoginFailureRepository loginFailureRepository;
    private final RefreshSessionRepository refreshSessionRepository;
    private final Clock clock;
    private final boolean enabled;

    public LoginFailureRetentionJob(LoginFailureRepository loginFailureRepository,
                                    RefreshSessionRepository refreshSessionRepository,
                                    Clock clock,
                                    @Value("${coms.retention.enabled:true}") boolean enabled) {
        this.loginFailureRepository = loginFailureRepository;
        this.refreshSessionRepository = refreshSessionRepository;
        this.clock = clock;
        this.enabled = enabled;
    }

    /** Runs nightly, off-peak. Package-visible schedule so it can be overridden per environment. */
    @Scheduled(cron = "${coms.retention.cron:0 30 4 * * *}", zone = "Asia/Seoul")
    @Transactional
    public void purgeOldLoginFailures() {
        if (!enabled) {
            log.debug("Retention purge disabled (coms.retention.enabled=false) — skipping.");
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(RETENTION_DAYS);
        loginFailureRepository.deleteOlderThan(cutoff);
        log.info("Purged login_failures older than {}", cutoff);
    }

    /** Drops refresh sessions that expired or were revoked more than a week ago. */
    @Scheduled(cron = "${coms.retention.refresh-sessions-cron:0 40 4 * * *}", zone = "Asia/Seoul")
    @Transactional
    public void purgeStaleRefreshSessions() {
        if (!enabled) {
            log.debug("Retention purge disabled (coms.retention.enabled=false) — skipping.");
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(REFRESH_SESSION_RETENTION_DAYS);
        int deleted = refreshSessionRepository.deleteStaleBefore(cutoff);
        log.info("Purged {} refresh_sessions rows expired or revoked before {}", deleted, cutoff);
    }
}
