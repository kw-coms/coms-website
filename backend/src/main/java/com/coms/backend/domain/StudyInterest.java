package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Entity
@Table(name = "study_interests", uniqueConstraints = @UniqueConstraint(name = "uk_study_interest", columnNames = {"group_id", "student_id"}))
public class StudyInterest {
    public enum Level { BEGINNER, INTERMEDIATE, ADVANCED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "group_id", nullable = false) private Long groupId;
    @Column(name = "student_id", nullable = false, length = 50) private String studentId;
    @Column(name = "preferred_slots", length = 400) private String preferredSlots;
    @Enumerated(EnumType.STRING) @Column(length = 20) private Level level;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
    public Long getId() { return id; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long value) { groupId = value; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String value) { studentId = value; }
    public String getPreferredSlots() { return preferredSlots; }
    public void setPreferredSlots(String value) { preferredSlots = value; }
    public Level getLevel() { return level; }
    public void setLevel(Level value) { level = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
