package com.coms.backend.controller;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClubOfficerMigrationTest {
    @Test
    void migrationEnforcesConstraintsCascadesTermsAndNullsRosterLink() throws Exception {
        try (Connection db = DriverManager.getConnection("jdbc:h2:mem:club-officer-migration-check;MODE=PostgreSQL")) {
            String sql;
            try (var input = getClass().getResourceAsStream("/db/migration/V117__club_officers.sql")) {
                assertThat(input).isNotNull();
                sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            }
            try (var s = db.createStatement()) {
                s.execute("CREATE TABLE eligible_members (id BIGINT PRIMARY KEY)");
                s.execute("INSERT INTO eligible_members VALUES (1)");
                for (String part : sql.split(";")) if (!part.isBlank()) s.execute(part);
                s.execute("INSERT INTO club_officer_terms (id, label, \"year\") VALUES (101, '70대', 2026), (102, '71대', 2026)");
                assertThatThrownBy(() -> s.execute("INSERT INTO club_officer_terms (label, \"year\") VALUES ('70대', 2025)"))
                        .hasMessageContaining("UQ_CLUB_OFFICER_TERMS_LABEL");
                s.execute("INSERT INTO club_officers (id, term_id, role, name, eligible_member_id) VALUES (10, 101, 'PRESIDENT', '가나다', 1)");
                s.execute("INSERT INTO club_officers (id, term_id, role, name) VALUES (11, 102, 'VICE_PRESIDENT', '라마바')");
                assertThatThrownBy(() -> s.execute("INSERT INTO club_officers (term_id, role, name) VALUES (101, 'MEMBER', 'x')"))
                        .isInstanceOf(java.sql.SQLException.class);
                assertThatThrownBy(() -> s.execute("INSERT INTO club_officers (term_id, role, name) VALUES (99, 'PRESIDENT', 'x')"))
                        .isInstanceOf(java.sql.SQLException.class);
                s.execute("DELETE FROM eligible_members WHERE id = 1");
                try (var rows = s.executeQuery("SELECT eligible_member_id FROM club_officers WHERE id = 10")) {
                    rows.next();
                    rows.getLong(1);
                    assertThat(rows.wasNull()).isTrue();
                }
                s.execute("DELETE FROM club_officer_terms WHERE id = 101");
                try (var rows = s.executeQuery("SELECT COUNT(*) FROM club_officers")) {
                    rows.next();
                    assertThat(rows.getInt(1)).isEqualTo(1);
                }
            }
        }
    }
}
