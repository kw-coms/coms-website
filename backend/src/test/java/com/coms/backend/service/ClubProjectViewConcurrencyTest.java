package com.coms.backend.service;

import com.coms.backend.repository.ClubProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:club-project-view-concurrency;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-project-view-concurrency"
})
class ClubProjectViewConcurrencyTest {
    @Autowired ClubProjectService projects;
    @Autowired ClubProjectRepository repository;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void normalEditCannotOverwriteAnAtomicViewIncrementFromAnotherTransaction() {
        long id = projects.create("APP", "새 작품", null, null, "제작자", null, null, null).id();
        try (var worker = Executors.newSingleThreadExecutor()) {
            new TransactionTemplate(transactionManager).executeWithoutResult(ignored -> {
                var stale = repository.findById(id).orElseThrow();
                assertThat(stale.getViewCount()).isZero();
                long viewed = CompletableFuture.supplyAsync(
                        () -> projects.detail(id, null, false).viewCount(), worker)
                        .orTimeout(10, TimeUnit.SECONDS).join();
                assertThat(viewed).isEqualTo(1L);
                projects.update(id, null, "수정된 작품", null, null, null, null, null, null);
            });
        }
        assertThat(repository.findById(id).orElseThrow().getViewCount()).isEqualTo(1L);
    }
}
