package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A gathering ("모임 신청"): a member opens one for a study, an outing or a dinner, and other
 * members put their names down while it is open. Sign-up stops at {@code closesAt} when one is
 * set, or when it is closed by hand ({@code closedAt}). See {@link GatheringSignup} for who
 * signed up.
 */
@Entity
@Table(name = "gatherings")
public class Gathering {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", length = 1000)
    private String description;

    /** How many may sign up; null for no limit. */
    @Column(name = "capacity")
    private Integer capacity;

    /** What each member is asked to add; null when nothing is asked. */
    @Column(name = "note_label", length = 40)
    private String noteLabel;

    @Column(name = "closes_at")
    private LocalDateTime closesAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "creator_student_id", nullable = false, length = 50)
    private String creatorStudentId;

    @Column(name = "creator_name", nullable = false, length = 100)
    private String creatorName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /** True while members can still sign up or withdraw. */
    public boolean isOpenAt(LocalDateTime now) {
        return closedAt == null && (closesAt == null || closesAt.isAfter(now));
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer capacity) { this.capacity = capacity; }
    public String getNoteLabel() { return noteLabel; }
    public void setNoteLabel(String noteLabel) { this.noteLabel = noteLabel; }
    public LocalDateTime getClosesAt() { return closesAt; }
    public void setClosesAt(LocalDateTime closesAt) { this.closesAt = closesAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }
    public String getCreatorStudentId() { return creatorStudentId; }
    public void setCreatorStudentId(String creatorStudentId) { this.creatorStudentId = creatorStudentId; }
    public String getCreatorName() { return creatorName; }
    public void setCreatorName(String creatorName) { this.creatorName = creatorName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
