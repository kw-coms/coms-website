package com.coms.backend.service;

import com.coms.backend.repository.LoginFailureRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/**
 * Deletes login-failure rows past their retention window.
 *
 * <p>{@code login_failures} grows with every failed login and is only ever read over a 15-minute
 * lockout window, so nothing older than a month has any use — but the repository's
 * {@code deleteOlderThan} had no caller, leaving the table to grow without bound (and to hold IP
 * addresses far longer than needed).
 */
@Service
public class LoginFailureRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(LoginFailureRetentionJob.class);
    private static final int RETENTION_DAYS = 30;

    private final LoginFailureRepository loginFailureRepository;
    private final Clock clock;
    private final boolean enabled;

    public LoginFailureRetentionJob(LoginFailureRepository loginFailureRepository,
                                    Clock clock,
                                    @Value("${coms.retention.enabled:true}") boolean enabled) {
        this.loginFailureRepository = loginFailureRepository;
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
}
