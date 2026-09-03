package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 후원 등급 (플래티넘 / 골드 / 실버 …). The colour is a validated #hex used only as a
 * CSS custom-property value on the public page, never as raw CSS text.
 */
@Entity
@Table(name = "sponsor_tiers")
public class SponsorTier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String name;

    // columnDefinition carries the DEFAULT so the V88 seed inserts still work on a
    // hibernate-generated schema (mirrors V82/V86).
    @Column(nullable = false, length = 16, columnDefinition = "VARCHAR(16) NOT NULL DEFAULT '#9ca3af'")
    private String color = "#9ca3af";

    @Column(name = "sort_order", nullable = false, columnDefinition = "INT NOT NULL DEFAULT 0")
    private int sortOrder = 0;

    @Column(length = 200)
    private String description;

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
