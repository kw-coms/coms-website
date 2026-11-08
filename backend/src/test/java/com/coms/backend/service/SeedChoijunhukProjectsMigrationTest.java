package com.coms.backend.service;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the real V54 / V59 / V80 / V104 / V105 scripts through Flyway on H2 (PostgreSQL mode). The older
 * migrations cannot run on H2 as a whole (PostgreSQL-only syntax), so only the ones that create and
 * alter club_projects / app_catalog_entries are used; V104 is then applied by Flyway on top of
 * whatever rows a test has put there. V105 (unlist Magic Survival Lab) is applied separately, so the
 * V104 tests keep seeing the 11 rows V104 inserts.
 */
class SeedChoijunhukProjectsMigrationTest {
    private static final String V104 = "V104__seed_choijunhuk_projects.sql";
    private static final String V105 = "V105__unlist_magic_survival_lab.sql";
    private static final String MSL_LINK = "https://choijunhuk.github.io/magic-survival-lab/";
    private static final List<String> TABLE_MIGRATIONS = List.of(
            "V54__club_projects.sql", "V59__app_catalog.sql", "V80__club_project_author_nullable.sql");
    private static final AtomicInteger DB_SEQ = new AtomicInteger();

    /** club_projects as served by /api/club-projects in production on 2026-11-08: title, link. */
    private static final String[][] PROD_CLUB_PROJECTS = {
            {"COMS 월드컵", "https://coms.kw.ac.kr/worldcup/"},
            {"COMS 티어표", "https://coms.kw.ac.kr/tier/"},
            {"Food Club", "https://coms.kw.ac.kr/foodclub/"},
            {"TeamMate", "https://coms.kw.ac.kr/team-randomizer/"},
            {"Game Club", "https://coms.kw.ac.kr/gameclub/"},
            {"KW Mate", "http://kwmate.com/"},
            {"Daily Coding", "https://dailycoding-final.com/"},
            {"BugSnap", "https://coms.kw.ac.kr/BugSnap/"},
            {"LogDoctor", "https://coms.kw.ac.kr/LogDoctor/"},
            {"COMS Member App", "https://github.com/choijunhuk/coms-member-app"},
            {"Rusty Alarm", "https://github.com/choijunhuk/rusty-alarm"},
            {"PRDoctor", "https://coms.kw.ac.kr/PRDoctor"},
            {"회로의 봄", "https://choijunhuk.github.io/campus-romance/"},
            {"debug-till-dawn", "https://choijunhuk.github.io/debug-till-dawn/"},
            {"KW Algorithm Lab", "https://choijunhuk.github.io/kw-algorithm-lab/"},
            {"indie-studio-idle", "https://choijunhuk.github.io/indie-studio-idle/"},
    };
    /** app_catalog_entries in production on 2026-11-08. */
    private static final String[][] PROD_APP_ENTRIES = {
            {"Food Club", "https://coms.kw.ac.kr/foodclub/"},
            {"TeamMate", "https://coms.kw.ac.kr/team-randomizer/"},
            {"Game Club", "https://coms.kw.ac.kr/gameclub/"},
            {"KW Mate", "https://kwmate.com/"},
            {"Daily Coding", "https://dailycoding-final.com/"},
            {"PRDoctor", "https://coms.kw.ac.kr/PRDoctor"},
    };
    private static final List<String> SEEDED_TITLES = List.of(
            "Packet Trail", "History Heroes", "Magic Survival Lab", "PhoneMote", "Memory Forge",
            "COM’s Companion", "NetLab", "Arcade Kart Racer", "Chrona", "BarMate", "chip8-rs",
            "KW Algorithm Lab");

    @TempDir
    Path migrationDirectory;

    @Test
    void productionShapedTablesGetElevenNewProjectsInEachTableAndNothingTwice() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();

            assertThat(db.count("club_projects")).isEqualTo(16 + 11);
            assertThat(db.count("app_catalog_entries")).isEqualTo(6 + 11);
            // KW Algorithm Lab is already in club_projects (id 15), so the user's rule skips it everywhere.
            assertThat(db.titles("club_projects")).filteredOn("KW Algorithm Lab"::equals).hasSize(1);
            assertThat(db.titles("app_catalog_entries")).doesNotContain("KW Algorithm Lab");
            assertThat(db.titles("club_projects")).doesNotHaveDuplicates();
            assertThat(db.titles("app_catalog_entries")).doesNotHaveDuplicates();
            // Appended after the existing rows.
            assertThat(db.count("club_projects WHERE made_by = '최준혁' AND position >= 16")).isEqualTo(11);
            assertThat(db.count("app_catalog_entries WHERE sort_order >= 6")).isEqualTo(11);
            // Club-hosted PhoneMote and repo-root BarMate links, in both tables.
            assertThat(db.single("SELECT link_url FROM club_projects WHERE title = 'PhoneMote'"))
                    .isEqualTo("https://coms.kw.ac.kr/phonemote/");
            assertThat(db.single("SELECT display_url FROM club_projects WHERE title = 'PhoneMote'"))
                    .isEqualTo("coms.kw.ac.kr/phonemote");
            assertThat(db.single("SELECT href FROM app_catalog_entries WHERE title = 'PhoneMote'"))
                    .isEqualTo("https://coms.kw.ac.kr/phonemote/");
            assertThat(db.single("SELECT link_url FROM club_projects WHERE title = 'BarMate'"))
                    .isEqualTo("https://github.com/choijunhuk/barmate");
            assertThat(db.single("SELECT display_url FROM club_projects WHERE title = 'BarMate'"))
                    .isEqualTo("github.com/choijunhuk/barmate");
            assertThat(db.single("SELECT href FROM app_catalog_entries WHERE title = 'BarMate'"))
                    .isEqualTo("https://github.com/choijunhuk/barmate");
        }
    }

    @Test
    void privateRepositoriesAreNeverSeeded() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();

            for (String privateRepo : List.of("hogwarts-life-sim", "project-ascent", "invest")) {
                assertThat(db.count("club_projects WHERE lower(link_url) LIKE '%/choijunhuk/" + privateRepo + "%'"))
                        .as("club_projects " + privateRepo).isZero();
                assertThat(db.count("app_catalog_entries WHERE lower(href) LIKE '%/choijunhuk/" + privateRepo + "%'"))
                        .as("app_catalog_entries " + privateRepo).isZero();
            }
        }
    }

    @Test
    void replayingTheScriptAfterAFlywayRunInsertsNothing() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();
            int clubRows = db.count("club_projects");
            int appRows = db.count("app_catalog_entries");

            db.statement.execute(sql());

            assertThat(db.count("club_projects")).isEqualTo(clubRows);
            assertThat(db.count("app_catalog_entries")).isEqualTo(appRows);
        }
    }

    @Test
    void emptyTablesGetAllTwelveProjects() throws Exception {
        try (var db = newDb()) {
            db.applyV104();

            assertThat(db.titles("club_projects")).containsExactlyInAnyOrderElementsOf(SEEDED_TITLES);
            assertThat(db.titles("app_catalog_entries")).containsExactlyInAnyOrderElementsOf(SEEDED_TITLES);
            assertThat(db.count("club_projects WHERE category = 'GAME'")).isEqualTo(5);
            assertThat(db.count("club_projects WHERE category = 'APP'")).isEqualTo(3);
            assertThat(db.count("club_projects WHERE category = 'WEBSITE'")).isEqualTo(4);
        }
    }

    static Stream<Arguments> guardCases() {
        // table, existing title, existing link, seeded title that is affected, expected to be skipped
        return Stream.of(
                Arguments.of("club_projects", "Hosted Phone", "https://coms.kw.ac.kr/phonemote/", "PhoneMote", true),
                Arguments.of("app_catalog_entries", "Hosted Phone", "https://COMS.kw.ac.kr/PhoneMote", "PhoneMote", true),
                Arguments.of("club_projects", "Hosted Companion", "https://coms.kw.ac.kr/companion/", "COM’s Companion", true),
                Arguments.of("app_catalog_entries", "Hosted Companion", "https://coms.kw.ac.kr/companion", "COM’s Companion", true),
                Arguments.of("club_projects", "Hero Pages", "https://choijunhuk.github.io/history-heroes/", "History Heroes", true),
                Arguments.of("app_catalog_entries", "Hero Pages", "http://ChoiJunHuk.github.io/History-Heroes", "History Heroes", true),
                Arguments.of("club_projects", "Other", "https://github.com/choijunhuk/barmate-v2", "BarMate", false),
                Arguments.of("app_catalog_entries", "Other", "https://github.com/choijunhuk/barmate-v2/", "BarMate", false),
                Arguments.of("club_projects", "Other", "https://github.com/choijunhuk/chrona-web", "Chrona", false),
                Arguments.of("app_catalog_entries", "Other", "https://github.com/choijunhuk/chrona-web/releases", "Chrona", false),
                Arguments.of("club_projects", "Other", "https://coms.kw.ac.kr/phonemote-old/", "PhoneMote", false),
                Arguments.of("club_projects", "COM's Companion", "https://example.com/c", "COM’s Companion", true),
                Arguments.of("app_catalog_entries", "com’s companion", "https://example.com/c", "COM’s Companion", true),
                Arguments.of("club_projects", "Other", null, "Chrona", false),
                Arguments.of("app_catalog_entries", "Other", null, "Chrona", false),
                Arguments.of("club_projects", "Other", "HTTPS://GitHub.com/ChoiJunHuk/Chrona/", "Chrona", true),
                Arguments.of("app_catalog_entries", "Other", "https://github.com/choijunhuk/packet-trail/tree/main", "Packet Trail", true),
                Arguments.of("club_projects", "PACKET trail", "https://example.com/p", "Packet Trail", true)
        );
    }

    @ParameterizedTest(name = "{0}: \"{1}\" / {2} -> {3} skipped={4}")
    @MethodSource("guardCases")
    void guardSkipsOrKeepsAProjectInBothTables(String table, String title, String link,
                                               String seededTitle, boolean skipped) throws Exception {
        try (var db = newDb()) {
            db.insertManualRow(table, title, link);
            db.applyV104();

            int expectedSeeded = skipped ? SEEDED_TITLES.size() - 1 : SEEDED_TITLES.size();
            for (String tableName : List.of("club_projects", "app_catalog_entries")) {
                List<String> seeded = db.titles(tableName).stream().filter(SEEDED_TITLES::contains).toList();
                if (skipped) {
                    assertThat(seeded).as(tableName).doesNotContain(seededTitle).hasSize(expectedSeeded);
                } else {
                    assertThat(seeded).as(tableName).contains(seededTitle).hasSize(expectedSeeded);
                }
            }
        }
    }

    @Test
    void repoAlreadyListedInOneTableIsSkippedInTheOtherToo() throws Exception {
        try (var db = newDb()) {
            db.insertManualRow("club_projects", "Manual", "https://github.com/choijunhuk/netlab");
            db.applyV104();

            assertThat(db.titles("app_catalog_entries")).doesNotContain("NetLab");
            assertThat(db.titles("club_projects")).doesNotContain("NetLab");
        }
    }

    @Test
    void v105RemovesOnlyMagicSurvivalLabFromBothTables() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();
            assertThat(db.titles("club_projects")).contains("Magic Survival Lab");
            assertThat(db.titles("app_catalog_entries")).contains("Magic Survival Lab");
            db.statement.execute("INSERT INTO club_project_files (club_project_id, stored_name, original_name, mime_type)"
                    + " SELECT id, 's', 'o', 'image/png' FROM club_projects WHERE title = 'Magic Survival Lab'");

            db.applyV105();

            assertThat(db.titles("club_projects")).doesNotContain("Magic Survival Lab");
            assertThat(db.titles("app_catalog_entries")).doesNotContain("Magic Survival Lab");
            assertThat(db.count("club_projects")).isEqualTo(16 + 10);
            assertThat(db.count("app_catalog_entries")).isEqualTo(6 + 10);
            assertThat(db.count("club_project_files")).isZero();
            // The other ten seeded projects (KW Algorithm Lab was never seeded on the fixture) stay in both tables.
            List<String> kept = SEEDED_TITLES.stream()
                    .filter(t -> !t.equals("Magic Survival Lab") && !t.equals("KW Algorithm Lab")).toList();
            assertThat(db.titles("club_projects")).containsAll(kept);
            assertThat(db.titles("app_catalog_entries")).containsAll(kept);
            assertThat(db.count("club_projects WHERE made_by = '최준혁' AND position >= 16")).isEqualTo(10);
            assertThat(db.count("app_catalog_entries WHERE sort_order >= 6")).isEqualTo(10);
        }
    }

    @Test
    void v105LeavesRowsAnAdminHasEditedSinceV104() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();
            db.statement.execute("UPDATE club_projects SET link_url = 'https://example.com/msl' WHERE title = 'Magic Survival Lab'");
            db.statement.execute("UPDATE app_catalog_entries SET href = 'https://example.com/msl' WHERE title = 'Magic Survival Lab'");

            db.applyV105();

            assertThat(db.count("club_projects WHERE title = 'Magic Survival Lab'")).isEqualTo(1);
            assertThat(db.count("app_catalog_entries WHERE title = 'Magic Survival Lab'")).isEqualTo(1);
            assertThat(db.count("club_projects")).isEqualTo(16 + 11);
            assertThat(db.count("app_catalog_entries")).isEqualTo(6 + 11);
        }
    }

    @Test
    void v105LeavesAClubRowWhoseAuthorWasChangedAndAnUnrelatedSameTitleRow() throws Exception {
        try (var db = newDb()) {
            db.insertManualRow("club_projects", "Magic Survival Lab", "https://example.com/other");
            db.statement.execute("UPDATE club_projects SET made_by = 'someone else'");
            db.insertClub("Magic Survival Lab", MSL_LINK, 1);
            db.statement.execute("UPDATE club_projects SET made_by = 'someone else' WHERE position = 1");

            db.statement.execute(resource(V105));

            assertThat(db.count("club_projects WHERE title = 'Magic Survival Lab'")).isEqualTo(2);
        }
    }

    @Test
    void v105IsANoOpWhenTheRowsAreAlreadyGone() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();
            db.applyV104();
            db.statement.execute("DELETE FROM club_projects WHERE title = 'Magic Survival Lab'");
            db.statement.execute("DELETE FROM app_catalog_entries WHERE title = 'Magic Survival Lab'");

            db.applyV105();
            db.statement.execute(resource(V105));

            assertThat(db.count("club_projects")).isEqualTo(16 + 10);
            assertThat(db.count("app_catalog_entries")).isEqualTo(6 + 10);
        }
    }

    @Test
    void v105OnTheProductionFixtureWithoutV104TouchesNothing() throws Exception {
        try (var db = newDb()) {
            db.loadProductionFixture();

            db.statement.execute(resource(V105));

            assertThat(db.count("club_projects")).isEqualTo(16);
            assertThat(db.count("app_catalog_entries")).isEqualTo(6);
        }
    }

    private Db newDb() throws Exception {
        String url = "jdbc:h2:mem:seed_choijunhuk_" + DB_SEQ.incrementAndGet() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        Path directory = Files.createDirectories(migrationDirectory.resolve("db" + DB_SEQ.get()));
        for (String name : TABLE_MIGRATIONS) {
            Files.writeString(directory.resolve(name), resource(name));
        }
        Files.writeString(directory.resolve(V104), sql());
        Files.writeString(directory.resolve(V105), resource(V105));
        Flyway flyway = Flyway.configure().dataSource(url, "sa", "")
                .locations("filesystem:" + directory).target("104").load();
        Flyway withV105 = Flyway.configure().dataSource(url, "sa", "")
                .locations("filesystem:" + directory).load();
        Flyway tablesOnly = Flyway.configure().dataSource(url, "sa", "")
                .locations("filesystem:" + directory).target("80").load();
        tablesOnly.migrate();
        return new Db(url, flyway, withV105);
    }

    private static String sql() throws Exception {
        return resource(V104);
    }

    private static String resource(String name) throws Exception {
        try (InputStream input = Objects.requireNonNull(
                SeedChoijunhukProjectsMigrationTest.class.getResourceAsStream("/db/migration/" + name), name)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** One in-memory database whose tables come from the real migrations, emptied of their seed rows. */
    private static final class Db implements AutoCloseable {
        final Connection connection;
        final Statement statement;
        private final Flyway flyway;
        private final Flyway withV105;

        Db(String url, Flyway flyway, Flyway withV105) throws Exception {
            this.connection = DriverManager.getConnection(url, "sa", "");
            this.statement = connection.createStatement();
            this.flyway = flyway;
            this.withV105 = withV105;
            statement.execute("DELETE FROM club_projects");
            statement.execute("DELETE FROM app_catalog_entries");
        }

        void loadProductionFixture() throws Exception {
            int position = 0;
            for (String[] row : PROD_CLUB_PROJECTS) {
                insertClub(row[0], row[1], position++);
            }
            position = 0;
            for (String[] row : PROD_APP_ENTRIES) {
                insertApp(row[0], row[1], position++);
            }
        }

        void insertManualRow(String table, String title, String link) throws Exception {
            if (table.equals("club_projects")) {
                insertClub(title, link, 0);
            } else {
                insertApp(title, link, 0);
            }
        }

        void insertClub(String title, String link, int position) throws Exception {
            try (var insert = connection.prepareStatement(
                    "INSERT INTO club_projects (category, title, made_by, link_url, position) VALUES ('WEBSITE', ?, '최준혁', ?, ?)")) {
                insert.setString(1, title);
                insert.setString(2, link);
                insert.setInt(3, position);
                insert.executeUpdate();
            }
        }

        private void insertApp(String title, String link, int position) throws Exception {
            try (var insert = connection.prepareStatement(
                    "INSERT INTO app_catalog_entries (title, href, sort_order) VALUES (?, ?, ?)")) {
                insert.setString(1, title);
                insert.setString(2, link);
                insert.setInt(3, position);
                insert.executeUpdate();
            }
        }

        void applyV104() {
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        }

        void applyV105() {
            assertThat(withV105.migrate().migrationsExecuted).isEqualTo(1);
        }

        int count(String fromAndWhere) throws Exception {
            return Integer.parseInt(single("SELECT COUNT(*) FROM " + fromAndWhere));
        }

        String single(String query) throws Exception {
            try (var rows = statement.executeQuery(query)) {
                assertThat(rows.next()).as(query).isTrue();
                return rows.getString(1);
            }
        }

        List<String> titles(String table) throws Exception {
            List<String> titles = new ArrayList<>();
            try (var rows = statement.executeQuery("SELECT title FROM " + table + " ORDER BY id")) {
                while (rows.next()) {
                    titles.add(rows.getString(1));
                }
            }
            return titles;
        }

        @Override
        public void close() throws Exception {
            statement.close();
            connection.close();
        }
    }
}
