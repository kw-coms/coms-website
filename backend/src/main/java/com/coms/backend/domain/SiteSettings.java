package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "site_settings")
public class SiteSettings {
    @Id
    private Long id = 1L;

    @Column(name = "semester_label", nullable = false, length = 120)
    private String semesterLabel;

    @Column(name = "recruitment_status", nullable = false, length = 120)
    private String recruitmentStatus;

    @Column(name = "recruitment_period", nullable = false, length = 240)
    private String recruitmentPeriod;

    @Column(name = "home_hero_title", nullable = false, length = 120)
    private String homeHeroTitle;

    @Column(name = "home_hero_copy", nullable = false, length = 500)
    private String homeHeroCopy;

    @Column(name = "contact_links_json", nullable = false, columnDefinition = "TEXT")
    private String contactLinksJson;

    // 동아리방 출입 비밀번호 — NEVER exposed through the public site-settings
    // response; read via the member-gated /api/club-room endpoint only.
    @Column(name = "club_room_code", nullable = false, length = 60)
    private String clubRoomCode = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSemesterLabel() { return semesterLabel; }
    public void setSemesterLabel(String semesterLabel) { this.semesterLabel = semesterLabel; }
    public String getRecruitmentStatus() { return recruitmentStatus; }
    public void setRecruitmentStatus(String recruitmentStatus) { this.recruitmentStatus = recruitmentStatus; }
    public String getRecruitmentPeriod() { return recruitmentPeriod; }
    public void setRecruitmentPeriod(String recruitmentPeriod) { this.recruitmentPeriod = recruitmentPeriod; }
    public String getHomeHeroTitle() { return homeHeroTitle; }
    public void setHomeHeroTitle(String homeHeroTitle) { this.homeHeroTitle = homeHeroTitle; }
    public String getHomeHeroCopy() { return homeHeroCopy; }
    public void setHomeHeroCopy(String homeHeroCopy) { this.homeHeroCopy = homeHeroCopy; }
    public String getContactLinksJson() { return contactLinksJson; }
    public String getClubRoomCode() { return clubRoomCode == null ? "" : clubRoomCode; }
    public void setClubRoomCode(String clubRoomCode) { this.clubRoomCode = clubRoomCode == null ? "" : clubRoomCode; }
    public void setContactLinksJson(String contactLinksJson) { this.contactLinksJson = contactLinksJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
