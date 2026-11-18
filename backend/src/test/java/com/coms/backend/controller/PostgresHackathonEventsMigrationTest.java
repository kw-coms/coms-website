package com.coms.backend.controller;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfEnvironmentVariable(named = "COMS_PG_TEST_URL", matches = ".+")
class PostgresHackathonEventsMigrationTest {
    @Test
    void populatedReviewsSurviveForwardMigrationAndIdentityKeepsAdvancing() {
        var data = new DriverManagerDataSource(System.getenv("COMS_PG_TEST_URL"), System.getenv("COMS_PG_TEST_USER"), System.getenv("COMS_PG_TEST_PASSWORD"));
        var before = Flyway.configure().dataSource(data).locations("classpath:db/migration").target("112")
                .cleanDisabled(false).load();
        before.clean();
        before.migrate();
        var jdbc = new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS hackathon_decoy CASCADE");
        jdbc.execute("CREATE SCHEMA hackathon_decoy");
        jdbc.execute("CREATE TABLE hackathon_decoy.hackathon_reviews(project_id VARCHAR(40) CHECK (project_id IN ('unrelated')))");
        jdbc.update("INSERT INTO hackathon_reviews(project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at) VALUES ('wargether',42,'기존 회원','기존회원',FALSE,18,17,16,15,14,'기존 피드백',TIMESTAMP '2026-11-18 09:00:00')");
        jdbc.update("INSERT INTO hackathon_reviews(project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at) VALUES ('still',0,'회장','chair',TRUE,20,20,20,20,20,'기존 회장 메모',TIMESTAMP '2026-11-18 09:01:00')");
        List<Map<String, Object>> snapshot = jdbc.queryForList("SELECT id,project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at FROM hackathon_reviews ORDER BY id");
        long lastId = ((Number) snapshot.getLast().get("id")).longValue();
        assertThat(Flyway.configure().dataSource(data).locations("classpath:db/migration").load().migrate().success).isTrue();
        assertThat(jdbc.queryForList("SELECT id,project_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback,created_at FROM hackathon_reviews ORDER BY id")).isEqualTo(snapshot);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM hackathon_reviews WHERE event_id=1", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM hackathon_materials", Integer.class)).isEqualTo(13);
        assertThat(jdbc.queryForObject("SELECT open FROM hackathon_events WHERE id=1", Boolean.class)).isTrue();
        jdbc.update("INSERT INTO hackathon_events(title,event_year,semester,published,open) VALUES ('새 해커톤',2027,1,TRUE,TRUE)");
        jdbc.update("INSERT INTO hackathon_projects(id,event_id,title,author,description,position) VALUES ('fresh-team',2,'새 작품','새 팀','설명',0)");
        jdbc.update("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('fresh-team',2,42,'기존 회원','기존회원',FALSE,18,17,16,15,14,'')");
        assertThat(jdbc.queryForObject("SELECT MAX(id) FROM hackathon_reviews", Long.class)).isGreaterThan(lastId);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('still',2,42,'잘못된 팀','bad',FALSE,18,17,16,15,14,'')"))
                .hasMessageContaining("fk_hackathon_review_project");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO hackathon_reviews(project_id,event_id,generation,name,name_key,chair,theme_fit,creativity,technology,completeness,practicality,feedback) VALUES ('fresh-team',2,42,'중복','기존회원',FALSE,18,17,16,15,14,'')"))
                .hasMessageContaining("uq_hackathon_review_identity");
        jdbc.execute("DROP SCHEMA hackathon_decoy CASCADE");
    }
}
