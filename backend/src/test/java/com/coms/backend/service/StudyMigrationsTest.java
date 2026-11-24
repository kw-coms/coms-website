package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StudyMigrationsTest {
    @TempDir Path migrations;

    @Test
    void nullableLeaderMigrationClearsDeletedLeaderMarkersButPreservesRealLeaders() throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:study-leader;MODE=PostgreSQL", "sa", "");
             var sql = connection.createStatement()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V129__study_groups.sql"));
            sql.execute("""
                    INSERT INTO study_groups (id,name,leader_student_id,term,status,created_by) VALUES
                      (1,'Vacant','removed','2026 2학기','ENDED','removed'),
                      (2,'Occupied','removed','2026 2학기','ENDED','removed'),
                      (3,'Active','other','2026 2학기','ACTIVE','other')
                    """);
            sql.execute("INSERT INTO study_group_members (group_id,student_id,role,status) VALUES (2,'removed','LEADER','APPROVED')");
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V132__study_group_leader_nullable.sql"));
            try (var rows = sql.executeQuery("SELECT leader_student_id FROM study_groups ORDER BY id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isNull();
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("removed");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("other");
            }
        }
    }

    @Test
    void studyMigrationsUpgradeLegacyAttendanceAndArchiveWithoutChangingTheirRows() throws Exception {
        String url = "jdbc:h2:mem:study-migrations;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V97__attendance.sql"));
            sql.execute("CREATE TABLE archive_files (id BIGSERIAL PRIMARY KEY, uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, visibility VARCHAR(20) NOT NULL DEFAULT 'MEMBERS')");
            sql.execute("INSERT INTO archive_files DEFAULT VALUES");
            sql.execute("INSERT INTO attendance_sessions (title,code,opened_by_student_id,opened_by_name,closes_at) VALUES ('기존 출석','1234','old','기존 부원',CURRENT_TIMESTAMP)");
            sql.execute("INSERT INTO attendance_records (session_id,student_id,member_name) VALUES (1,'old','기존 부원')");
            for (String migration : new String[]{"V129__study_groups.sql", "V130__study_sessions_attendance.sql", "V131__study_archive_materials.sql"}) {
                try (var source = getClass().getResourceAsStream("/db/migration/" + migration)) {
                    assertThat(source).isNotNull();
                    Files.copy(source, migrations.resolve(migration));
                }
            }
            var result = Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + migrations)
                    .baselineOnMigrate(true).baselineVersion("128").load().migrate();
            assertThat(result.success).isTrue();
            assertThat(result.migrationsExecuted).isEqualTo(3);
            try (var rows = sql.executeQuery("SELECT status,source,checked_at FROM attendance_records WHERE student_id='old'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("status")).isEqualTo("PRESENT");
                assertThat(rows.getString("source")).isEqualTo("CODE");
                assertThat(rows.getTimestamp("checked_at")).isNotNull();
            }
            try (var rows = sql.executeQuery("SELECT visibility,study_group_id,study_session_id FROM archive_files WHERE id=1")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("visibility")).isEqualTo("MEMBERS");
                assertThat(rows.getObject("study_group_id")).isNull();
                assertThat(rows.getObject("study_session_id")).isNull();
            }
            sql.execute("INSERT INTO study_groups (name,leader_student_id,term,status,created_by) VALUES ('스터디','leader','2026 2학기','RECRUITING','leader')");
            sql.execute("INSERT INTO study_group_members (group_id,student_id,role,status) VALUES (1,'leader','LEADER','APPROVED')");
            assertThatThrownBy(() -> sql.execute("INSERT INTO study_group_members (group_id,student_id,role,status) VALUES (1,'leader','MEMBER','PENDING')"))
                    .isInstanceOf(SQLException.class);
            sql.execute("INSERT INTO study_sessions (group_id,round_no,session_date,topic) VALUES (1,1,CURRENT_DATE,'첫 회차')");
            assertThatThrownBy(() -> sql.execute("INSERT INTO study_sessions (group_id,round_no,session_date,topic) VALUES (1,1,CURRENT_DATE,'중복')"))
                    .isInstanceOf(SQLException.class);
            sql.execute("INSERT INTO attendance_sessions (title,code,opened_by_student_id,opened_by_name,closes_at,study_session_id) VALUES ('스터디 출석','5678','leader','리더',CURRENT_TIMESTAMP,1)");
            sql.execute("INSERT INTO attendance_records (session_id,student_id,member_name,checked_at,status,source) VALUES (2,'leader','리더',NULL,'ABSENT','MANUAL')");
            sql.execute("UPDATE archive_files SET study_group_id=1,study_session_id=1,visibility='GROUP' WHERE id=1");
            assertThatThrownBy(() -> sql.execute("UPDATE archive_files SET study_group_id=999 WHERE id=1"))
                    .isInstanceOf(SQLException.class);
        }
    }
}
