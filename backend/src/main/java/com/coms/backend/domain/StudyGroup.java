package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "study_groups")
public class StudyGroup {
    public enum Status { PROPOSED, RECRUITING, ACTIVE, ENDED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 120) private String name;
    @Column(columnDefinition = "TEXT") private String description;
    @Column(name = "topic_tags", length = 500) private String topicTags;
    @Column(name = "leader_student_id", nullable = false, length = 50) private String leaderStudentId;
    @Column(nullable = false, length = 40) private String term;
    @Column(name = "schedule_text", length = 200) private String schedule;
    @Column(length = 200) private String place;
    private Integer capacity;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Status status;
    @Column(name = "created_by", nullable = false, length = 50) private String createdBy;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt = LocalDateTime.now();
    @PreUpdate void touch() { updatedAt = LocalDateTime.now(); }
    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getTopicTags() { return topicTags; }
    public void setTopicTags(String value) { topicTags = value; }
    public String getLeaderStudentId() { return leaderStudentId; }
    public void setLeaderStudentId(String value) { leaderStudentId = value; }
    public String getTerm() { return term; }
    public void setTerm(String value) { term = value; }
    public String getSchedule() { return schedule; }
    public void setSchedule(String value) { schedule = value; }
    public String getPlace() { return place; }
    public void setPlace(String value) { place = value; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer value) { capacity = value; }
    public Status getStatus() { return status; }
    public void setStatus(Status value) { status = value; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String value) { createdBy = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
