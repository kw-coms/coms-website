package com.coms.backend.service;

import com.coms.backend.repository.LoginFailureRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * login_failures 보존 기간 정리 검증. deleteOlderThan 은 원래 호출자가 없는 죽은 코드였다.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:login-failure-retention-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class LoginFailureRetentionJobTest {

    @Autowired
    private LoginFailureRetentionJob job;

    @Autowired
    private LoginFailureRepository loginFailureRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        loginFailureRepository.deleteAll();
    }

    @Test
    void deletesOnlyRowsOlderThanTheRetentionWindow() {
        LocalDateTime now = LocalDateTime.now();
        insert("2026123456", "203.0.113.1", now.minusDays(31));
        insert("2026123457", "203.0.113.2", now.minusDays(400));
        insert("2026123458", "203.0.113.3", now.minusDays(29));
        insert("2026123459", "203.0.113.4", now.minusMinutes(5));

        job.purgeOldLoginFailures();

        assertThat(studentIds()).containsExactlyInAnyOrder("2026123458", "2026123459");
    }

    @Test
    void keepsEverythingWhenRetentionIsDisabled() {
        insert("2026123456", "203.0.113.1", LocalDateTime.now().minusDays(400));

        LoginFailureRetentionJob disabled =
                new LoginFailureRetentionJob(loginFailureRepository, java.time.Clock.systemDefaultZone(), false);
        disabled.purgeOldLoginFailures();

        assertThat(loginFailureRepository.count()).isEqualTo(1);
    }

    private void insert(String studentId, String ip, LocalDateTime attemptedAt) {
        jdbcTemplate.update(
                "INSERT INTO login_failures (student_id, ip, attempted_at) VALUES (?, ?, ?)",
                studentId, ip, Timestamp.valueOf(attemptedAt));
    }

    private java.util.List<String> studentIds() {
        return jdbcTemplate.queryForList("SELECT student_id FROM login_failures", String.class);
    }
}
