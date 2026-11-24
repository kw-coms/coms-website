package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:club-project-lock-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class ClubProjectOptimisticLockTest {
    @Autowired ClubProjectService projects;
    @Autowired EntityManagerFactory entityManagers;

    @Test
    void staleMemberEditCannotRepublishAnAdminRejectedProject() {
        long id = projects.create("APP", "검토 작품", null, null, "회원", null, null, null).id();
        try (var staleManager = entityManagers.createEntityManager()) {
            staleManager.getTransaction().begin();
            ClubProject stale = staleManager.find(ClubProject.class, id);
            assertThat(stale.getReviewStatus()).isEqualTo(ClubProject.ReviewStatus.APPROVED);

            projects.review(id, ClubProject.ReviewStatus.REJECTED, stale.getVersion());
            stale.setTitle("뒤늦게 저장한 제목");
            stale.setReviewStatus(ClubProject.ReviewStatus.APPROVED);
            assertThatThrownBy(staleManager::flush).isInstanceOf(OptimisticLockException.class);
            staleManager.getTransaction().rollback();
        }
        assertThat(projects.get(id).getReviewStatus()).isEqualTo(ClubProject.ReviewStatus.REJECTED);
    }
}
