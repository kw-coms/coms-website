package com.coms.backend.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "club_event_rsvps",
        uniqueConstraints = @UniqueConstraint(name = "uk_club_event_rsvps_event_student", columnNames = {"club_event_id", "student_id"}))
public class ClubEventRsvp {

    public enum Status {
        GOING, MAYBE, NOT_GOING
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_event_id", nullable = false)
    private Long clubEventId;

    @Column(name = "student_id", nullable = false)
    private String studentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.GOING;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getClubEventId() { return clubEventId; }
    public void setClubEventId(Long clubEventId) { this.clubEventId = clubEventId; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
