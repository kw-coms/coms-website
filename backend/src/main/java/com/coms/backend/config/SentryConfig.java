package com.coms.backend.config;

import io.sentry.Sentry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

/**
 * Env-gated Sentry initialization.
 *
 * <p>The {@code sentry-spring-boot-starter-jakarta} auto-configuration targets Spring Boot 3
 * and breaks on Boot 4 (it references the removed {@code RestClientCustomizer}). We therefore
 * initialize Sentry programmatically here, which is Boot-version-agnostic.
 *
 * <p>A blank {@code sentry.dsn} leaves Sentry uninitialized — every {@code Sentry.captureX}
 * call is then a clean no-op (Sentry's default disabled behavior).
 */
@Configuration
public class SentryConfig {

    private static final Logger log = LoggerFactory.getLogger(SentryConfig.class);

    private final String dsn;
    private final String environment;
    private final double tracesSampleRate;

    public SentryConfig(@Value("${sentry.dsn:}") String dsn,
                        @Value("${sentry.environment:production}") String environment,
                        @Value("${sentry.traces-sample-rate:0.1}") double tracesSampleRate) {
        this.dsn = dsn == null ? "" : dsn.trim();
        this.environment = environment;
        this.tracesSampleRate = tracesSampleRate;
    }

    @PostConstruct
    public void init() {
        if (dsn.isEmpty()) {
            log.info("Sentry disabled — sentry.dsn is blank (no-op).");
            return;
        }
        Sentry.init(options -> {
            options.setDsn(dsn);
            options.setEnvironment(environment);
            options.setTracesSampleRate(tracesSampleRate);
        });
        log.info("Sentry initialized for environment '{}'.", environment);
    }
}
