package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "club_event_votes",
        uniqueConstraints = @UniqueConstraint(name = "uk_club_event_votes_event_student", columnNames = {"club_event_id", "student_id"}))
public class ClubEventVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_event_id", nullable = false)
    private Long clubEventId;

    @Column(name = "entry_id", nullable = false)
    private Long entryId;

    @Column(name = "student_id", nullable = false, length = 50)
    private String studentId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getClubEventId() { return clubEventId; }
    public void setClubEventId(Long clubEventId) { this.clubEventId = clubEventId; }
    public Long getEntryId() { return entryId; }
    public void setEntryId(Long entryId) { this.entryId = entryId; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
