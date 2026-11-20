package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "team_project_milestones")
public class TeamProjectMilestone {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_id", nullable = false)
    private Long programId;
    @Column(nullable = false, length = 120)
    private String title;
    @Column(nullable = false, length = 2000)
    private String description = "";
    @Column(name = "starts_at")
    private LocalDateTime startsAt;
    @Column(name = "due_at")
    private LocalDateTime dueAt;
    @Column(nullable = false)
    private boolean submittable;
    @Column(nullable = false)
    private int position;

    public Long getId() { return id; }
    public Long getProgramId() { return programId; }
    public void setProgramId(Long value) { programId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public LocalDateTime getStartsAt() { return startsAt; }
    public void setStartsAt(LocalDateTime value) { startsAt = value; }
    public LocalDateTime getDueAt() { return dueAt; }
    public void setDueAt(LocalDateTime value) { dueAt = value; }
    public boolean isSubmittable() { return submittable; }
    public void setSubmittable(boolean value) { submittable = value; }
    public int getPosition() { return position; }
    public void setPosition(int value) { position = value; }
}
