package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * V112 pinned hackathon_reviews.generation to 0..60, so a 61기 reviewer (2027) would hit a 500.
 * The service now caps it at the current generation; the table only keeps a wide sanity range.
 * The old check is unnamed (generated name differs between Postgres and H2), so look it up like V113 does.
 */
public class V115__hackathon_review_generation_range extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection db = context.getConnection();
        String check = legacyGenerationCheck(db);
        try (Statement sql = db.createStatement()) {
            sql.execute("ALTER TABLE hackathon_reviews DROP CONSTRAINT " + sql.enquoteIdentifier(check, true));
            sql.execute("ALTER TABLE hackathon_reviews ADD CONSTRAINT ck_hackathon_review_generation CHECK (generation BETWEEN 0 AND 999)");
        }
    }

    private static String legacyGenerationCheck(Connection db) throws SQLException {
        boolean postgres = db.getMetaData().getDatabaseProductName().toLowerCase(Locale.ROOT).contains("postgresql");
        String query = postgres
                ? """
                    SELECT c.conname, pg_get_constraintdef(c.oid)
                    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = ? AND t.relname = 'hackathon_reviews' AND c.contype = 'c'
                    """
                : """
                    SELECT tc.constraint_name, cc.check_clause
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.check_constraints cc
                      ON tc.constraint_catalog = cc.constraint_catalog
                     AND tc.constraint_schema = cc.constraint_schema
                     AND tc.constraint_name = cc.constraint_name
                    WHERE tc.table_schema = ? AND LOWER(tc.table_name) = 'hackathon_reviews'
                        AND tc.constraint_type = 'CHECK'
                    """;
        List<String> matches = new ArrayList<>();
        try (PreparedStatement statement = db.prepareStatement(query)) {
            statement.setString(1, db.getSchema());
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    String definition = rows.getString(2).replaceAll("[\\s\"()]", "").toLowerCase(Locale.ROOT);
                    // The chair rule (chair = (generation = 0)) also mentions generation; only the 0..60 range is replaced.
                    if (!definition.contains("generation") || definition.contains("chair")) continue;
                    if (!definition.contains("60")) {
                        throw new SQLException("Unexpected hackathon generation constraint: " + definition);
                    }
                    String name = rows.getString(1);
                    if (!name.matches("[A-Za-z_][A-Za-z0-9_]{0,127}")) {
                        throw new SQLException("Unexpected hackathon constraint identifier");
                    }
                    matches.add(name);
                }
            }
        }
        if (matches.size() != 1) throw new SQLException("Expected exactly one hackathon generation range check; found " + matches.size());
        return matches.getFirst();
    }
}
