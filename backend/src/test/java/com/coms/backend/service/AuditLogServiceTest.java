package com.coms.backend.service;

import com.coms.backend.repository.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:audit-log-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class AuditLogServiceTest {
    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @BeforeEach
    void setUp() {
        auditLogRepository.deleteAll();
    }

    @Test
    void recentUsesRequestedLimitSoAdminsCanInspectMoreThanDefaultWindow() {
        for (int i = 0; i < 350; i++) {
            auditLogService.record("admin", "ACTION_" + i, "TEST", String.valueOf(i), "detail=" + i, "127.0.0.1");
        }

        assertThat(auditLogService.recent(300)).hasSize(300);
        assertThat(auditLogService.recent(350)).hasSize(350);
    }

    @Test
    void recentCapsLargeRequestsAtOperationalMaximum() {
        for (int i = 0; i < 2105; i++) {
            auditLogService.record("admin", "ACTION_" + i, "TEST", String.valueOf(i), null, null);
        }

        assertThat(auditLogService.recent(9999)).hasSize(2000);
    }
}
