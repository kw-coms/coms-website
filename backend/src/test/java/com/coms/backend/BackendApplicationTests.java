package com.coms.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:backend-application-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class BackendApplicationTests {

	@Autowired
	private ThreadPoolTaskScheduler taskScheduler;

	@Test
	void contextLoads() {
	}

	@Test
	void scheduledJobsDoNotShareOneThread() {
		// A slow job (the app link check) must not hold up the nightly retention jobs.
		assertThat(taskScheduler.getScheduledThreadPoolExecutor().getCorePoolSize()).isGreaterThanOrEqualTo(2);
	}

}
