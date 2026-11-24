package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(name = "hackathon_reviews", uniqueConstraints =
        {@UniqueConstraint(name = "uq_hackathon_review_ip", columnNames = {"event_id", "project_id", "ip_key"}),
         @UniqueConstraint(name = "uq_hackathon_review_member", columnNames = {"event_id", "project_id", "reviewer_student_id"})})
public class HackathonReview {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_id", nullable = false)
    private Long eventId = 1L;
    @Column(name = "project_id", nullable = false, length = 40)
    private String projectId;
    @Column(nullable = false)
    private Integer generation;
    @Column(nullable = false, length = 40)
    private String name;
    @Column(name = "name_key", nullable = false, length = 80)
    private String nameKey;
    @Column(name = "ip_key", length = 45)
    private String ipKey;
    @Column(name = "reviewer_student_id", length = 20)
    private String reviewerStudentId;
    @Column(nullable = false)
    private boolean chair;
    @Column(name = "theme_fit", nullable = false)
    private Integer themeFit;
    @Column(nullable = false)
    private Integer creativity;
    @Column(nullable = false)
    private Integer technology;
    @Column(nullable = false)
    private Integer completeness;
    @Column(nullable = false)
    private Integer practicality;
    @Column(nullable = false, length = 2000)
    private String feedback = "";
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getEventId() { return eventId; }
    public void setEventId(Long value) { eventId = value; }
    public String getProjectId() { return projectId; }
    public void setProjectId(String value) { projectId = value; }
    public Integer getGeneration() { return generation; }
    public void setGeneration(Integer value) { generation = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String value) { nameKey = value; }
    public String getIpKey() { return ipKey; }
    public void setIpKey(String value) { ipKey = value; }
    public String getReviewerStudentId() { return reviewerStudentId; }
    public void setReviewerStudentId(String value) { reviewerStudentId = value; }
    public boolean isChair() { return chair; }
    public void setChair(boolean value) { chair = value; }
    public Integer getThemeFit() { return themeFit; }
    public void setThemeFit(Integer value) { themeFit = value; }
    public Integer getCreativity() { return creativity; }
    public void setCreativity(Integer value) { creativity = value; }
    public Integer getTechnology() { return technology; }
    public void setTechnology(Integer value) { technology = value; }
    public Integer getCompleteness() { return completeness; }
    public void setCompleteness(Integer value) { completeness = value; }
    public Integer getPracticality() { return practicality; }
    public void setPracticality(Integer value) { practicality = value; }
    public String getFeedback() { return feedback; }
    public void setFeedback(String value) { feedback = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
}
