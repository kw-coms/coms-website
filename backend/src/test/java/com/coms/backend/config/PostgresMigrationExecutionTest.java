package com.coms.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs every Flyway migration from an empty database against a real Postgres.
 *
 * <p>The rest of the suite runs on H2 with {@code ddl-auto=create-drop}, so until now nothing
 * actually executed the migration scripts — a migration could be syntactically valid Postgres and
 * still fail on deploy (or, worse, disagree with the entity mapping) and CI would stay green.
 *
 * <p>Only the Postgres tests need a database; they are skipped unless {@code COMS_PG_TEST_URL} is
 * set, so local {@code ./gradlew test} keeps working with no external database. CI supplies it
 * from a {@code services: postgres} container.
 */
@EnabledIfEnvironmentVariable(named = "COMS_PG_TEST_URL", matches = ".+")
class PostgresMigrationExecutionTest {

    @Test
    void everyMigrationAppliesCleanlyFromAnEmptyDatabase() {
        DataSource dataSource = dataSource();

        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .load();
        flyway.clean();

        MigrateResult result = flyway.migrate();

        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted).isGreaterThan(0);

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        // A fresh installation must not publish or provision a fixed administrator
        // or a real member's roster record from source-controlled migrations.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM members", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM eligible_members", Integer.class)).isZero();
        assertThat(columnExists(jdbc, "refresh_sessions", "family")).isTrue();
        assertThat(columnExists(jdbc, "eligible_members", "initial_role")).isTrue();
        // Hibernate validates the schema on boot, so the entity defaults and the migration
        // defaults must agree — a mismatch here is exactly the kind of drift this test exists for.
        assertThat(jdbc.queryForObject(
                "SELECT column_default FROM information_schema.columns "
                        + "WHERE table_name = 'eligible_members' AND column_name = 'initial_role'",
                String.class)).contains("USER");
    }

    /**
     * V93 rewrites rows members already have, so it is checked against data rather than only for
     * syntax: the schema is built up to V92, filled the way production looks, then migrated.
     */
    @Test
    void anonymousBoardCommentNotificationsLoseTheCommenterAndNothingElseChanges() {
        DataSource dataSource = dataSource();
        Flyway before = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .target("92")
                .load();
        before.clean();
        before.migrate();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        long anonymousPost = insertPost(jdbc, "ANONYMOUS");
        long generalPost = insertPost(jdbc, "GENERAL");
        long deletedAnonymousPost = 900_001L;
        long deletedGeneralPost = 900_002L;
        long vanishedPost = 900_003L;
        insertDeletedSnapshot(jdbc, deletedAnonymousPost, "ANONYMOUS");
        insertDeletedSnapshot(jdbc, deletedGeneralPost, "GENERAL");

        long anonymousComment = insertNotification(jdbc, "COMMENT_ON_POST", anonymousPost, "홍길동님이 내 글에 댓글을 남겼습니다.", true);
        long anonymousReply = insertNotification(jdbc, "REPLY_ON_COMMENT", anonymousPost, "홍길동님이 내 댓글에 답글을 남겼습니다.", false);
        long deletedAnonymousComment = insertNotification(jdbc, "COMMENT_ON_POST", deletedAnonymousPost, "홍길동님이 내 글에 댓글을 남겼습니다.", false);
        long generalComment = insertNotification(jdbc, "COMMENT_ON_POST", generalPost, "홍길동님이 내 글에 댓글을 남겼습니다.", false);
        long deletedGeneralReply = insertNotification(jdbc, "REPLY_ON_COMMENT", deletedGeneralPost, "홍길동님이 내 댓글에 답글을 남겼습니다.", false);
        // Its post is neither on the board nor in the archive, so nobody can say whether it was anonymous.
        long vanishedComment = insertNotification(jdbc, "COMMENT_ON_POST", vanishedPost, "홍길동님이 내 글에 댓글을 남겼습니다.", false);
        long vanishedReply = insertNotification(jdbc, "REPLY_ON_COMMENT", vanishedPost, "홍길동님이 내 댓글에 답글을 남겼습니다.", false);
        long vanishedModeration = insertNotification(jdbc, "COMMUNITY_POST_RESTORED", vanishedPost, "홍길동님이 글을 복원했습니다.", false);
        // A moderator's notice on an anonymous post names the moderator on purpose.
        long moderation = insertNotification(jdbc, "COMMUNITY_POST_DELETED", anonymousPost, "홍길동님이 글을 삭제했습니다.", false);
        Map<String, Object> readStateBefore = jdbc.queryForMap(
                "SELECT recipient_student_id, read_at, created_at, post_id, comment_id FROM notifications WHERE id = ?", anonymousComment);

        MigrateResult result = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertThat(result.success).isTrue();
        assertScrubbed(jdbc, anonymousComment, "내 익명 글에 새 댓글이 달렸습니다.");
        assertScrubbed(jdbc, anonymousReply, "익명 게시판의 내 댓글에 새 답글이 달렸습니다.");
        assertScrubbed(jdbc, deletedAnonymousComment, "내 익명 글에 새 댓글이 달렸습니다.");
        assertUntouched(jdbc, generalComment, "홍길동님이 내 글에 댓글을 남겼습니다.");
        assertUntouched(jdbc, deletedGeneralReply, "홍길동님이 내 댓글에 답글을 남겼습니다.");
        assertScrubbed(jdbc, vanishedComment, "삭제된 내 글에 댓글이 달렸습니다.");
        assertScrubbed(jdbc, vanishedReply, "삭제된 글의 내 댓글에 답글이 달렸습니다.");
        assertUntouched(jdbc, vanishedModeration, "홍길동님이 글을 복원했습니다.");
        assertUntouched(jdbc, moderation, "홍길동님이 글을 삭제했습니다.");
        // Only identity is removed: the row, its recipient, read state and link all stay.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications", Integer.class)).isEqualTo(9);
        assertThat(jdbc.queryForMap(
                "SELECT recipient_student_id, read_at, created_at, post_id, comment_id FROM notifications WHERE id = ?", anonymousComment))
                .isEqualTo(readStateBefore);
        assertThat((Timestamp) readStateBefore.get("read_at")).isNotNull();
    }

    private static DataSource dataSource() {
        return new DriverManagerDataSource(
                System.getenv("COMS_PG_TEST_URL"),
                System.getenv().getOrDefault("COMS_PG_TEST_USER", "postgres"),
                System.getenv().getOrDefault("COMS_PG_TEST_PASSWORD", "postgres"));
    }

    private static long insertPost(JdbcTemplate jdbc, String category) {
        Long id = jdbc.queryForObject(
                "INSERT INTO community_posts (title, content, author_student_id, author_name, category) "
                        + "VALUES ('제목', '본문', '2025123456', '작성자', ?) RETURNING id",
                Long.class, category);
        return id == null ? -1 : id;
    }

    private static void insertDeletedSnapshot(JdbcTemplate jdbc, long originalPostId, String category) {
        jdbc.update(
                "INSERT INTO deleted_community_posts (original_post_id, title, content, author_student_id, author_name, category, "
                        + "original_created_at, original_updated_at, deleted_by_student_id, deleted_by_name, deleted_by_role, deletion_reason) "
                        + "VALUES (?, '제목', '본문', '2025123456', '작성자', ?, now(), now(), '2025123456', '작성자', 'USER', '직접 삭제')",
                originalPostId, category);
    }

    private static long insertNotification(JdbcTemplate jdbc, String type, long postId, String message, boolean read) {
        Long id = jdbc.queryForObject(
                "INSERT INTO notifications (recipient_student_id, actor_student_id, actor_label, type, post_id, comment_id, message, read_at) "
                        + "VALUES ('2025123456', '2026111111', '홍길동', ?, ?, 77, ?, CASE WHEN ? THEN now() ELSE NULL END) RETURNING id",
                Long.class, type, postId, message, read);
        return id == null ? -1 : id;
    }

    private static void assertScrubbed(JdbcTemplate jdbc, long id, String expectedMessage) {
        Map<String, Object> row = jdbc.queryForMap("SELECT actor_student_id, actor_label, message FROM notifications WHERE id = ?", id);
        assertThat(row.get("actor_student_id")).isNull();
        assertThat(row.get("actor_label")).isNull();
        assertThat(row.get("message")).isEqualTo(expectedMessage);
    }

    private static void assertUntouched(JdbcTemplate jdbc, long id, String expectedMessage) {
        Map<String, Object> row = jdbc.queryForMap("SELECT actor_student_id, actor_label, message FROM notifications WHERE id = ?", id);
        assertThat(row.get("actor_student_id")).isEqualTo("2026111111");
        assertThat(row.get("actor_label")).isEqualTo("홍길동");
        assertThat(row.get("message")).isEqualTo(expectedMessage);
    }

    private static boolean columnExists(JdbcTemplate jdbc, String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
