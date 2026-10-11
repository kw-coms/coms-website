package com.coms.backend.service;

import com.coms.backend.domain.AuditLog;
import com.coms.backend.repository.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The connection pool is pinned to a single connection, so any code path that needs a second
 * one while already holding the first cannot complete. That is exactly what a nested
 * REQUIRES_NEW audit write did: with the default pool of ten, ten concurrent requests each
 * held a connection while waiting for another, and every database call on the site stalled
 * until the acquisition timeout — including for anonymous callers hammering the login.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:audit-log-connection-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "spring.datasource.hikari.maximum-pool-size=1",
        "spring.datasource.hikari.connection-timeout=1500"
})
class AuditLogConnectionUsageTest {

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        auditLogRepository.deleteAll();
    }

    @Test
    void recordInsideCallerTransactionDoesNotNeedSecondConnection() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                auditLogService.record("2026000001", "TEST_ACTION", "TEST", "1", "inside a transaction", "203.0.113.5"));

        assertThat(auditLogRepository.findAll())
                .singleElement()
                .extracting(AuditLog::getAction)
                .isEqualTo("TEST_ACTION");
    }

    @Test
    void recordCommitsOrRollsBackWithTheActionItDescribes() {
        TransactionTemplate template = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> template.executeWithoutResult(status -> {
            auditLogService.record("2026000001", "POST_DELETE", "TEST", "1", "the caller then fails", null);
            throw new IllegalStateException("business failure after the audit call");
        })).isInstanceOf(IllegalStateException.class);

        // The row shares the caller's transaction, so an action that never happened leaves no
        // "it happened" entry behind. Callers that audit a rejection (login) commit explicitly.
        assertThat(auditLogRepository.count()).isZero();
    }

    @Test
    void recordWithoutCallerTransactionIsWrittenImmediately() {
        auditLogService.record("2026000001", "STANDALONE", "TEST", "1", null, null);

        assertThat(auditLogRepository.count()).isEqualTo(1);
    }

    @Test
    void overlongValuesAreTrimmedInsteadOfFailingTheWrite() {
        String longValue = "가".repeat(400);

        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                auditLogService.record(longValue, longValue, longValue, longValue, "x".repeat(5000), longValue));

        AuditLog saved = auditLogRepository.findAll().getFirst();
        assertThat(saved.getActorStudentId()).hasSize(50);
        assertThat(saved.getAction()).hasSize(80);
        assertThat(saved.getTargetType()).hasSize(80);
        assertThat(saved.getTargetId()).hasSize(120);
        assertThat(saved.getIpAddress()).hasSize(80);
        assertThat(saved.getDetail()).hasSize(1000);
    }

    @Test
    void nestedNewTransactionCannotGetConnectionFromSingleConnectionPool() {
        // Documents the constraint the tests above rely on: with one pooled connection, opening
        // a second transaction while the first is still active fails instead of hanging forever.
        TransactionTemplate outer = new TransactionTemplate(transactionManager);
        TransactionTemplate inner = new TransactionTemplate(transactionManager);
        inner.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        assertThatThrownBy(() -> outer.executeWithoutResult(status -> {
            auditLogRepository.count();
            inner.executeWithoutResult(nested -> auditLogRepository.count());
        })).isInstanceOf(RuntimeException.class);
    }
}
