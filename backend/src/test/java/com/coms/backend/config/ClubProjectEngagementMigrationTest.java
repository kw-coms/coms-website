package com.coms.backend.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ClubProjectEngagementMigrationTest {
    @Test
    void migrationRunsOnH2AndEnforcesUniqueLikesAndReplyCascade() throws Exception {
        try (var stream = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V111__club_project_engagement.sql")) {
            assertThat(stream).isNotNull();
            String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            try (var db = DriverManager.getConnection("jdbc:h2:mem:club-project-v111;MODE=PostgreSQL")) {
                try (var statement = db.createStatement()) {
                    statement.execute("CREATE TABLE members (student_id VARCHAR(255) PRIMARY KEY)");
                    statement.execute("CREATE TABLE club_projects (id BIGINT PRIMARY KEY)");
                    for (String command : sql.split(";")) {
                        if (!command.isBlank()) statement.execute(command.trim());
                    }
                    statement.execute("INSERT INTO club_projects(id) VALUES (1)");
                    statement.execute("INSERT INTO members(student_id) VALUES ('member'), ('other')");
                    statement.execute("INSERT INTO club_project_likes(club_project_id, student_id) VALUES (1, 'member')");
                    assertThrows(SQLException.class, () -> statement.execute(
                            "INSERT INTO club_project_likes(club_project_id, student_id) VALUES (1, 'member')"));
                    statement.execute("INSERT INTO club_project_comments(id, club_project_id, student_id, author_name, content, depth) "
                            + "VALUES (1, 1, 'member', 'writer', 'parent', 0)");
                    statement.execute("INSERT INTO club_project_comments(id, club_project_id, student_id, author_name, content, parent_comment_id, depth) "
                            + "VALUES (2, 1, 'other', 'reply', 'child', 1, 1)");
                    statement.execute("DELETE FROM club_project_comments WHERE id = 1");
                    try (var rows = statement.executeQuery("SELECT count(*) FROM club_project_comments")) {
                        rows.next();
                        assertThat(rows.getLong(1)).isZero();
                    }
                    assertThrows(SQLException.class, () -> statement.execute(
                            "INSERT INTO club_project_comments(club_project_id, student_id, author_name, content, depth) "
                                    + "VALUES (1, 'member', 'writer', 'too deep', 31)"));
                }
            }
        }
    }

    @Test
    void staleMemberLookupCannotWriteInteractionsAfterAccountPurgeCommits() throws Exception {
        String sql;
        try (var stream = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V111__club_project_engagement.sql")) {
            assertThat(stream).isNotNull();
            sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
        String url = "jdbc:h2:mem:club-project-v111-race;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var setup = DriverManager.getConnection(url); var statement = setup.createStatement()) {
            statement.execute("CREATE TABLE members (student_id VARCHAR(255) PRIMARY KEY)");
            statement.execute("CREATE TABLE club_projects (id BIGINT PRIMARY KEY)");
            for (String command : sql.split(";")) {
                if (!command.isBlank()) statement.execute(command.trim());
            }
            statement.execute("INSERT INTO club_projects(id) VALUES (1)");
            statement.execute("INSERT INTO members(student_id) VALUES ('departing')");
        }
        try (var purge = DriverManager.getConnection(url); var late = DriverManager.getConnection(url)) {
            purge.setAutoCommit(false);
            late.setAutoCommit(false);
            try (var statement = late.createStatement();
                 var seen = statement.executeQuery("SELECT student_id FROM members WHERE student_id = 'departing'")) {
                assertThat(seen.next()).isTrue();
            }
            try (var statement = purge.createStatement()) {
                statement.execute("DELETE FROM club_project_comments WHERE student_id = 'departing'");
                statement.execute("DELETE FROM club_project_likes WHERE student_id = 'departing'");
                statement.execute("DELETE FROM members WHERE student_id = 'departing'");
                purge.commit();
            }
            try (var statement = late.createStatement()) {
                assertThrows(SQLException.class, () -> statement.execute(
                        "INSERT INTO club_project_likes(club_project_id, student_id) VALUES (1, 'departing')"));
                late.rollback();
                assertThrows(SQLException.class, () -> statement.execute(
                        "INSERT INTO club_project_comments(club_project_id, student_id, author_name, content, depth) "
                                + "VALUES (1, 'departing', 'old author', 'orphan', 0)"));
                late.rollback();
            }
        }
        try (var check = DriverManager.getConnection(url); var statement = check.createStatement()) {
            statement.execute("INSERT INTO members(student_id) VALUES ('departing')");
            try (var likes = statement.executeQuery("SELECT COUNT(*) FROM club_project_likes")) {
                likes.next();
                assertThat(likes.getLong(1)).isZero();
            }
            try (var comments = statement.executeQuery("SELECT COUNT(*) FROM club_project_comments")) {
                comments.next();
                assertThat(comments.getLong(1)).isZero();
            }
        }
    }
}
