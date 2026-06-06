package com.coms.backend;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class MigrationVersionTest {

    private static final Pattern VERSIONED_MIGRATION = Pattern.compile("^V(\\d+)__.+\\.sql$");
    private static final Pattern ADD_EDITED_COLUMN =
            Pattern.compile("(?i)ALTER\\s+TABLE\\s+community_posts\\s+ADD\\s+COLUMN\\s+edited\\b");

    @Test
    void migrationVersionsAreUnique() throws IOException {
        Set<String> versions = new HashSet<>();
        Set<String> duplicates = new HashSet<>();

        try (var migrations = Files.list(Path.of("src/main/resources/db/migration"))) {
            migrations.map(path -> path.getFileName().toString())
                    .map(VERSIONED_MIGRATION::matcher)
                    .filter(Matcher::matches)
                    .map(matcher -> matcher.group(1))
                    .filter(version -> !versions.add(version))
                    .forEach(duplicates::add);
        }

        assertTrue(duplicates.isEmpty(), "Duplicate Flyway migration versions: " + duplicates);
    }

    @Test
    void migrationsResolveInFlyway() {
        Flyway flyway = Flyway.configure()
                .dataSource("jdbc:h2:mem:flyway-migration-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "")
                .locations("classpath:db/migration")
                .load();

        flyway.info().all();
    }

    @Test
    void communityEditedColumnIsAddedOnce() throws IOException {
        long additions;

        try (var migrations = Files.list(Path.of("src/main/resources/db/migration"))) {
            additions = migrations.filter(path -> path.getFileName().toString().endsWith(".sql"))
                    .map(MigrationVersionTest::readUnchecked)
                    .filter(sql -> ADD_EDITED_COLUMN.matcher(sql).find())
                    .count();
        }

        assertTrue(additions == 1, "community_posts.edited must be added by exactly one migration");
    }

    private static String readUnchecked(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read migration " + path, exception);
        }
    }
}
