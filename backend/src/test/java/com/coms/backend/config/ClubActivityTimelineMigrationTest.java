package com.coms.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import static org.assertj.core.api.Assertions.assertThat;

class ClubActivityTimelineMigrationTest {
    @Test
    void v124AppliesAfterCategoryMigrationOnFreshH2Database() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:activity-timeline-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        try (var connection = source.getConnection()) {
            for (String migration : new String[]{"V49__club_activities.sql", "V52__club_activity_categories.sql"}) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/" + migration));
            }
            try (var statement = connection.createStatement()) {
                // V64's multi-column ADD syntax is PostgreSQL-only; mirror its resulting schema in H2.
                statement.execute("ALTER TABLE club_activities ADD COLUMN end_date DATE NOT NULL DEFAULT CURRENT_DATE");
                statement.execute("ALTER TABLE club_activities ADD COLUMN start_time TIME");
                statement.execute("ALTER TABLE club_activities ADD COLUMN end_time TIME");
            }
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V124__activity_timeline.sql"));
            try (var statement = connection.createStatement()) {
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM club_activities WHERE show_on_timeline = TRUE AND event_date IS NULL")) {
                    rows.next();
                    assertThat(rows.getInt(1)).isEqualTo(5);
                }
                try (var rows = statement.executeQuery("SELECT timeline_status, timeline_term, date_label FROM club_activities WHERE title = '해커톤 결과 · 시상 공지'")) {
                    rows.next();
                    assertThat(rows.getString(1)).isEqualTo("DONE");
                    assertThat(rows.getString(2)).isEqualTo("2026 2학기");
                    assertThat(rows.getString(3)).isEqualTo("평가 완료 후");
                }
            }
        }
    }
}
