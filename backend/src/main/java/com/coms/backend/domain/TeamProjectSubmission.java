package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "team_project_submissions")
public class TeamProjectSubmission {
    public enum Timing { AUTOMATIC, ON_TIME, LATE }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_id", nullable = false)
    private Long programId;
    @Column(name = "team_id", nullable = false)
    private Long teamId;
    @Column(name = "milestone_id", nullable = false)
    private Long milestoneId;
    @Column(nullable = false, length = 20000)
    private String body = "";
    @Column(name = "submitted_by", nullable = false)
    private String submittedBy;
    @Column(name = "submitted_by_name", nullable = false)
    private String submittedByName;
    @Column(name = "updated_by", nullable = false)
    private String updatedBy;
    @Column(name = "updated_by_name", nullable = false)
    private String updatedByName;
    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    @Column(name = "submitted_after_close", nullable = false)
    private boolean submittedAfterClose;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Timing timing = Timing.AUTOMATIC;

    public Long getId() { return id; }
    public Long getProgramId() { return programId; }
    public void setProgramId(Long value) { programId = value; }
    public Long getTeamId() { return teamId; }
    public void setTeamId(Long value) { teamId = value; }
    public Long getMilestoneId() { return milestoneId; }
    public void setMilestoneId(Long value) { milestoneId = value; }
    public String getBody() { return body; }
    public void setBody(String value) { body = value; }
    public String getSubmittedBy() { return submittedBy; }
    public void setSubmittedBy(String value) { submittedBy = value; }
    public String getSubmittedByName() { return submittedByName; }
    public void setSubmittedByName(String value) { submittedByName = value; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String value) { updatedBy = value; }
    public String getUpdatedByName() { return updatedByName; }
    public void setUpdatedByName(String value) { updatedByName = value; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime value) { submittedAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { updatedAt = value; }
    public boolean isSubmittedAfterClose() { return submittedAfterClose; }
    public void setSubmittedAfterClose(boolean value) { submittedAfterClose = value; }
    public Timing getTiming() { return timing; }
    public void setTiming(Timing value) { timing = value; }
}
