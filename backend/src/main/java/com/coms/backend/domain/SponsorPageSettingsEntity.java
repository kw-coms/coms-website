package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Single-row (id = 1) holder for the 후원자 page design settings.
 *
 * <p>The payload is stored as a JSON document in a TEXT column, the same shape
 * {@code site_settings.contact_links_json} uses: the test suite runs on H2 in
 * PostgreSQL mode, which has no {@code jsonb}. It is parsed into the typed
 * {@code SponsorPageSettings} record (which rejects unknown keys) on the way in and out.
 */
@Entity
@Table(name = "sponsor_page_settings")
public class SponsorPageSettingsEntity {

    @Id
    private Integer id = 1;

    @Column(nullable = false, columnDefinition = "TEXT NOT NULL DEFAULT '{}'")
    private String settings = "{}";

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public String getSettings() { return settings; }
    public void setSettings(String settings) { this.settings = settings; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
