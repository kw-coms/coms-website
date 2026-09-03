package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 후원자 한 명(또는 한 곳).
 *
 * <p>{@code amountNote} is 회장 전용 bookkeeping and must never be mapped into a public
 * response; {@code anonymous} rows are published as "익명 후원자" with no logo and no link.
 * A row whose {@code untilDate} has passed, or whose {@code visible} is false, drops out of
 * the public list but stays visible in the admin table with a 만료/숨김 badge.
 */
@Entity
@Table(name = "sponsors")
public class Sponsor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "tier_id")
    private Long tierId;

    @Column(name = "logo_image_id")
    private Long logoImageId;

    @Column(name = "link_url", length = 500)
    private String linkUrl;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "amount_note", length = 120)
    private String amountNote;

    @Column(name = "since_date")
    private LocalDate sinceDate;

    @Column(name = "until_date")
    private LocalDate untilDate;

    @Column(nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT FALSE")
    private boolean anonymous = false;

    @Column(nullable = false, columnDefinition = "BOOLEAN NOT NULL DEFAULT TRUE")
    private boolean visible = true;

    @Column(name = "sort_order", nullable = false, columnDefinition = "INT NOT NULL DEFAULT 0")
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    /** Hidden rows and rows whose sponsorship window has closed never reach the public list. */
    public boolean isPubliclyVisible(LocalDate today) {
        return visible && (untilDate == null || !untilDate.isBefore(today));
    }

    public boolean isExpired(LocalDate today) {
        return untilDate != null && untilDate.isBefore(today);
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Long getTierId() { return tierId; }
    public void setTierId(Long tierId) { this.tierId = tierId; }
    public Long getLogoImageId() { return logoImageId; }
    public void setLogoImageId(Long logoImageId) { this.logoImageId = logoImageId; }
    public String getLinkUrl() { return linkUrl; }
    public void setLinkUrl(String linkUrl) { this.linkUrl = linkUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getAmountNote() { return amountNote; }
    public void setAmountNote(String amountNote) { this.amountNote = amountNote; }
    public LocalDate getSinceDate() { return sinceDate; }
    public void setSinceDate(LocalDate sinceDate) { this.sinceDate = sinceDate; }
    public LocalDate getUntilDate() { return untilDate; }
    public void setUntilDate(LocalDate untilDate) { this.untilDate = untilDate; }
    public boolean isAnonymous() { return anonymous; }
    public void setAnonymous(boolean anonymous) { this.anonymous = anonymous; }
    public boolean isVisible() { return visible; }
    public void setVisible(boolean visible) { this.visible = visible; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
