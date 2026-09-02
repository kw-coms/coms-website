package com.coms.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables {@code @Scheduled}. Without it the retention job (and any future scheduled task) is
 * silently never invoked — {@code @EnableAsync} on {@link AsyncConfig} does not cover scheduling.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
