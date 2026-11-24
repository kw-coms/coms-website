package com.coms.backend.service;

import com.coms.backend.config.StudyConcurrencyDatabase;
import com.coms.backend.dto.ClubFormDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr"
})
class StudyClubFormConcurrencyTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        StudyConcurrencyDatabase.configure(registry, "study_club_form_concurrency");
    }

    @Autowired ClubFormService forms;
    @Autowired PlatformTransactionManager transactions;

    @Test
    void categoryEditWaitsForStudyResponseRead() throws Exception {
        assertCategoryEditWaitsForStudyRead(false);
    }

    @Test
    void categoryEditWaitsForStudyAggregateRead() throws Exception {
        assertCategoryEditWaitsForStudyRead(true);
    }

    private void assertCategoryEditWaitsForStudyRead(boolean aggregate) throws Exception {
        ClubFormDto.Form form = forms.save(null, write(ClubFormDto.Category.STUDY, null));
        CountDownLatch readFinished = new CountDownLatch(1);
        CountDownLatch releaseReader = new CountDownLatch(1);
        CountDownLatch writerStarted = new CountDownLatch(1);
        CountDownLatch writerFinished = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var reader = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                if (aggregate) {
                    assertThat(forms.aggregates(form.id(), true).total()).isZero();
                } else {
                    assertThat(forms.responses(form.id(), 0, true).items()).isEmpty();
                }
                readFinished.countDown();
                try {
                    assertThat(releaseReader.await(10, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException(ex);
                }
            }));
            assertThat(readFinished.await(10, TimeUnit.SECONDS)).isTrue();

            var writer = pool.submit(() -> {
                writerStarted.countDown();
                forms.save(form.id(), write(ClubFormDto.Category.OTHER, form.version()));
                writerFinished.countDown();
            });
            assertThat(writerStarted.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(writerFinished.await(300, TimeUnit.MILLISECONDS)).isFalse();

            releaseReader.countDown();
            reader.get(10, TimeUnit.SECONDS);
            writer.get(10, TimeUnit.SECONDS);
            assertThat(forms.adminList()).filteredOn(saved -> saved.id().equals(form.id()))
                    .singleElement().extracting(ClubFormDto.Form::category).isEqualTo(ClubFormDto.Category.OTHER);
        } finally {
            releaseReader.countDown();
            pool.shutdownNow();
        }
    }

    private static ClubFormDto.Write write(ClubFormDto.Category category, Long version) {
        return new ClubFormDto.Write("스터디 조사", "", category, null,
                List.of(new ClubFormDto.Question("level", "수준", ClubFormDto.Kind.SHORT, false, List.of())),
                true, null, version);
    }
}
