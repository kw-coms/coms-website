package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

class SeedChoijunhukProjectsMigrationTest {
    private static final String MIGRATION = "V104__seed_choijunhuk_projects.sql";

    @TempDir
    Path migrationDirectory;

    @Test
    void emptyTablesReceiveAllTwelveProjectsAfterExistingRows() throws Exception {
        String url = "jdbc:h2:mem:seed_choijunhuk_empty;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            createTables(statement);
            statement.execute("INSERT INTO club_projects (category, title, made_by, link_url, position) "
                    + "VALUES ('WEBSITE', 'PRDoctor', '최준혁', 'https://coms.kw.ac.kr/PRDoctor/', 11)");
            statement.execute("INSERT INTO app_catalog_entries (title, href, sort_order) "
                    + "VALUES ('PRDoctor', 'https://coms.kw.ac.kr/PRDoctor/', 5)");

            assertThat(migrate(url).migrationsExecuted).isEqualTo(1);

            assertThat(count(statement, "club_projects WHERE made_by = '최준혁'")).isEqualTo(13);
            assertThat(count(statement, "app_catalog_entries")).isEqualTo(13);
            assertThat(count(statement, "club_projects WHERE position BETWEEN 12 AND 23")).isEqualTo(12);
            assertThat(count(statement, "app_catalog_entries WHERE sort_order BETWEEN 6 AND 17")).isEqualTo(12);
            assertThat(count(statement, "club_projects WHERE category = 'GAME'")).isEqualTo(5);
            assertThat(count(statement, "club_projects WHERE category = 'APP'")).isEqualTo(3);
            assertThat(count(statement, "club_projects WHERE category = 'WEBSITE'")).isEqualTo(5);
            // Private repos are never seeded or linked.
            assertThat(count(statement, "club_projects WHERE lower(link_url) LIKE '%hogwarts-life-sim%' "
                    + "OR lower(link_url) LIKE '%project-ascent%' OR lower(link_url) LIKE '%/invest%'")).isZero();
            // Column limits from V54 / V59 hold for every inserted row.
            assertThat(count(statement, "club_projects WHERE length(title) > 120 OR length(eyebrow) > 60 "
                    + "OR length(link_url) > 500 OR length(display_url) > 255")).isZero();
            assertThat(count(statement, "app_catalog_entries WHERE length(title) > 120 OR length(eyebrow) > 60 "
                    + "OR length(href) > 500")).isZero();
        }
    }

    @Test
    void rowsAlreadyPresentByTitleLinkOrRepoPathAreSkipped() throws Exception {
        String url = "jdbc:h2:mem:seed_choijunhuk_dupes;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            createTables(statement);
            // By title (different case), by exact link (different case), by repo path with an
            // unrelated suffix, and by deployed host with a different scheme and no slash.
            statement.execute("INSERT INTO club_projects (category, title, made_by, link_url, position) VALUES "
                    + "('GAME', 'packet TRAIL', 'x', 'https://example.com/a', 0), "
                    + "('GAME', 'Manual One', 'x', 'HTTPS://GITHUB.COM/CHOIJUNHUK/HISTORY-HEROES/RELEASES', 1), "
                    + "('APP', 'Manual Two', 'x', 'https://github.com/choijunhuk/Chrona/tree/main', 2), "
                    + "('WEBSITE', 'Manual Three', 'x', 'http://choijunhuk.github.io/phonemote', 3)");
            statement.execute("INSERT INTO app_catalog_entries (title, href, sort_order) VALUES "
                    + "('NETLAB', 'https://example.com/b', 0), "
                    + "('Manual', 'https://github.com/choijunhuk/chip8-rs/', 1), "
                    + "('Manual Host', 'http://choijunhuk.github.io/kw-algorithm-lab', 2)");

            migrate(url);

            assertThat(count(statement, "club_projects")).isEqualTo(4 + 8);
            assertThat(count(statement, "club_projects WHERE lower(title) IN "
                    + "('packet trail', 'history heroes', 'chrona', 'phonemote')")).isEqualTo(1);
            assertThat(count(statement, "app_catalog_entries")).isEqualTo(3 + 9);
            assertThat(count(statement, "app_catalog_entries WHERE lower(title) = 'netlab'")).isEqualTo(1);
            assertThat(count(statement, "app_catalog_entries WHERE lower(href) LIKE '%chip8-rs%'")).isEqualTo(1);
            assertThat(count(statement, "app_catalog_entries WHERE lower(href) LIKE '%kw-algorithm-lab%'")).isEqualTo(1);
            // Appended after the highest existing position, in order.
            assertThat(count(statement, "club_projects WHERE position >= 4")).isEqualTo(8);
        }
    }

    @Test
    void rerunningTheScriptAndFlywayAddsNothing() throws Exception {
        String url = "jdbc:h2:mem:seed_choijunhuk_rerun;MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var statement = connection.createStatement()) {
            createTables(statement);

            assertThat(migrate(url).migrationsExecuted).isEqualTo(1);
            assertThat(migrate(url).migrationsExecuted).isZero();          // Flyway: already applied
            statement.execute(sql());                                        // raw replay: guards hold

            assertThat(count(statement, "club_projects")).isEqualTo(12);
            assertThat(count(statement, "app_catalog_entries")).isEqualTo(12);
        }
    }

    private static void createTables(Statement statement) throws Exception {
        statement.execute("CREATE TABLE club_projects (id BIGSERIAL PRIMARY KEY, category VARCHAR(40) NOT NULL, "
                + "title VARCHAR(120) NOT NULL, description TEXT, eyebrow VARCHAR(60), made_by VARCHAR(100) NOT NULL, "
                + "link_url VARCHAR(500), display_url VARCHAR(255), position INTEGER NOT NULL DEFAULT 0)");
        statement.execute("CREATE TABLE app_catalog_entries (id BIGSERIAL PRIMARY KEY, title VARCHAR(120) NOT NULL, "
                + "eyebrow VARCHAR(60), body TEXT, href VARCHAR(500), sort_order INTEGER NOT NULL DEFAULT 0)");
    }

    private static int count(Statement statement, String fromAndWhere) throws Exception {
        try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + fromAndWhere)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private String sql() throws Exception {
        try (InputStream input = Objects.requireNonNull(getClass().getResourceAsStream("/db/migration/" + MIGRATION))) {
            return new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private org.flywaydb.core.api.output.MigrateResult migrate(String url) throws Exception {
        Files.writeString(migrationDirectory.resolve(MIGRATION), sql());
        return Flyway.configure().dataSource(url, "sa", "")
                .locations("filesystem:" + migrationDirectory).baselineOnMigrate(true).load().migrate();
    }
}
