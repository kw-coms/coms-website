package com.coms.backend.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

class StudyAttendanceMigrationTest {
    @TempDir Path migrations;

    @Test void v130PreservesGenericAttendanceAndLinksOneCheckPerRoundOnH2() throws Exception {
        String url = "jdbc:h2:mem:study_attendance_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        for (String file : new String[]{"V97__attendance.sql", "V129__study_groups.sql", "V130__study_sessions_attendance.sql"}) {
            try (var source = getClass().getResourceAsStream("/db/migration/" + file)) {
                assertThat(source).isNotNull();
                Files.write(migrations.resolve(file), source.readAllBytes());
            }
        }
        assertThat(Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + migrations)
                .load().migrate().success).isTrue();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.execute("INSERT INTO study_groups (id,name,leader_student_id,term,status,created_by) VALUES (1,'자료구조','leader','2026 2학기','ACTIVE','leader')");
            sql.execute("INSERT INTO study_sessions (id,group_id,round_no,session_date,topic) VALUES (1,1,1,CURRENT_DATE,'스택')");
            sql.execute("INSERT INTO attendance_sessions (id,title,code,opened_by_student_id,opened_by_name,closes_at) VALUES (1,'일반','1234','leader','리더',CURRENT_TIMESTAMP)");
            sql.execute("INSERT INTO attendance_sessions (id,title,code,opened_by_student_id,opened_by_name,closes_at,study_session_id,first_opened_at) VALUES (2,'스터디','5678','leader','리더',CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP)");
            sql.execute("INSERT INTO attendance_records (session_id,student_id,member_name,checked_at) VALUES (1,'member','멤버',CURRENT_TIMESTAMP)");
            sql.execute("INSERT INTO attendance_records (session_id,student_id,member_name,checked_at,status,source) VALUES (2,'member','멤버',NULL,'ABSENT','MANUAL')");
            try (var rows = sql.executeQuery("SELECT status,source FROM attendance_records ORDER BY session_id")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("PRESENT");
                assertThat(rows.getString(2)).isEqualTo("CODE");
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("ABSENT");
                assertThat(rows.getString(2)).isEqualTo("MANUAL");
            }
            assertThatThrownBy(() -> sql.execute("INSERT INTO attendance_sessions (title,code,opened_by_student_id,opened_by_name,closes_at,study_session_id) VALUES ('duplicate','9999','leader','리더',CURRENT_TIMESTAMP,1)"))
                    .isInstanceOf(SQLException.class);
        }
    }
}
