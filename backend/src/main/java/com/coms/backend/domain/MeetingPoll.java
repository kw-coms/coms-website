package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A meeting poll ("일정 조율"): a set of dates and a daily time window cut into slots, on which
 * members mark when they are free. See {@link MeetingPollAvailability} for the answers.
 */
@Entity
@Table(name = "meeting_polls")
public class MeetingPoll {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "creator_student_id", nullable = false, length = 50)
    private String creatorStudentId;

    @Column(name = "creator_name", nullable = false, length = 100)
    private String creatorName;

    /** ISO dates, sorted, comma separated. */
    @Column(name = "dates", nullable = false, columnDefinition = "TEXT")
    private String dates;

    @Column(name = "start_minute", nullable = false)
    private Integer startMinute;

    @Column(name = "end_minute", nullable = false)
    private Integer endMinute;

    @Column(name = "slot_minutes", nullable = false)
    private Integer slotMinutes = 30;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCreatorStudentId() { return creatorStudentId; }
    public void setCreatorStudentId(String creatorStudentId) { this.creatorStudentId = creatorStudentId; }
    public String getCreatorName() { return creatorName; }
    public void setCreatorName(String creatorName) { this.creatorName = creatorName; }
    public String getDates() { return dates; }
    public void setDates(String dates) { this.dates = dates; }
    public Integer getStartMinute() { return startMinute; }
    public void setStartMinute(Integer startMinute) { this.startMinute = startMinute; }
    public Integer getEndMinute() { return endMinute; }
    public void setEndMinute(Integer endMinute) { this.endMinute = endMinute; }
    public Integer getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(Integer slotMinutes) { this.slotMinutes = slotMinutes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
