package com.coms.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Enables @Async and provides a small bounded executor for push dispatch.
 * Push fan-out used to run synchronously inside the request thread, so
 * creating a notice blocked on one FCM round-trip per member.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "pushExecutor")
    public TaskExecutor pushExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("push-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(1000);
        executor.initialize();
        return executor;
    }

    /**
     * Outgoing mail that a request should not wait for (recruit application mails). SMTP can take
     * seconds; sending inline held the request thread — and its database connection — meanwhile.
     */
    @Bean(name = "mailExecutor")
    public TaskExecutor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("mail-");
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(500);
        executor.initialize();
        return executor;
    }
}
