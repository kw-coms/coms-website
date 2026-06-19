package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "club_activity_votes",
        uniqueConstraints = @UniqueConstraint(name = "uk_club_activity_votes_activity_student", columnNames = {"club_activity_id", "student_id"})
)
public class ClubActivityVote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_activity_id", nullable = false)
    private Long clubActivityId;

    @Column(name = "student_id", nullable = false)
    private String studentId;

    @Column(name = "vote_value", nullable = false)
    private int value;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getClubActivityId() { return clubActivityId; }
    public void setClubActivityId(Long clubActivityId) { this.clubActivityId = clubActivityId; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public int getValue() { return value; }
    public void setValue(int value) { this.value = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
