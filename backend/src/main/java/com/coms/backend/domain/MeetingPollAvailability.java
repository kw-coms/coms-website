package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * One member's answer to a {@link MeetingPoll}: a character per slot, day after day, '1' where
 * the member is free. One row per member per poll.
 */
@Entity
@Table(
        name = "meeting_poll_availabilities",
        uniqueConstraints = @UniqueConstraint(name = "uk_meeting_poll_availability_member", columnNames = {"poll_id", "student_id"})
)
public class MeetingPollAvailability {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "poll_id", nullable = false)
    private Long pollId;

    @Column(name = "student_id", nullable = false, length = 50)
    private String studentId;

    @Column(name = "member_name", nullable = false, length = 100)
    private String memberName;

    @Column(name = "slots", nullable = false, columnDefinition = "TEXT")
    private String slots;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getPollId() { return pollId; }
    public void setPollId(Long pollId) { this.pollId = pollId; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getMemberName() { return memberName; }
    public void setMemberName(String memberName) { this.memberName = memberName; }
    public String getSlots() { return slots; }
    public void setSlots(String slots) { this.slots = slots; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
