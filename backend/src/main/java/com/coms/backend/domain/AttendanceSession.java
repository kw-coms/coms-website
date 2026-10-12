package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * One attendance check ("출석 체크"): opened by whoever runs the seminar, with a short code
 * members type in from their own devices. Check-in stops at {@code closesAt}, or earlier if
 * it is closed by hand ({@code closedAt}). See {@link AttendanceRecord} for who checked in.
 */
@Entity
@Table(name = "attendance_sessions")
public class AttendanceSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "code", nullable = false, length = 8)
    private String code;

    @Column(name = "opened_by_student_id", nullable = false, length = 50)
    private String openedByStudentId;

    @Column(name = "opened_by_name", nullable = false, length = 100)
    private String openedByName;

    @Column(name = "opened_at", nullable = false)
    private LocalDateTime openedAt = LocalDateTime.now();

    @Column(name = "closes_at", nullable = false)
    private LocalDateTime closesAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    /** True while members can still check in. */
    public boolean isOpenAt(LocalDateTime now) {
        return closedAt == null && closesAt.isAfter(now);
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getOpenedByStudentId() { return openedByStudentId; }
    public void setOpenedByStudentId(String openedByStudentId) { this.openedByStudentId = openedByStudentId; }
    public String getOpenedByName() { return openedByName; }
    public void setOpenedByName(String openedByName) { this.openedByName = openedByName; }
    public LocalDateTime getOpenedAt() { return openedAt; }
    public void setOpenedAt(LocalDateTime openedAt) { this.openedAt = openedAt; }
    public LocalDateTime getClosesAt() { return closesAt; }
    public void setClosesAt(LocalDateTime closesAt) { this.closesAt = closesAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }
}
