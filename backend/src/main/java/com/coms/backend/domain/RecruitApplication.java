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
@Table(name = "recruit_applications")
public class RecruitApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String name;

    @Column(nullable = false, length = 10)
    private String studentId;

    @Column(nullable = false, length = 80)
    private String department;

    @Column(length = 50)
    private String grade;

    @Column(nullable = false, length = 30)
    private String phone;

    @Column(nullable = false, length = 120)
    private String email;

    @Column(columnDefinition = "TEXT")
    private String interests;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String motive;

    @Column(columnDefinition = "TEXT")
    private String experience;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String expectation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.RECEIVED;

    @Column(columnDefinition = "TEXT")
    private String adminNote;

    @Column(length = 45)
    private String clientIp;

    @Column(nullable = false)
    private LocalDateTime submittedAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public enum Status {
        RECEIVED, REVIEWING, ACCEPTED, HOLD, REJECTED
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getGrade() { return grade; }
    public void setGrade(String grade) { this.grade = grade; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getInterests() { return interests; }
    public void setInterests(String interests) { this.interests = interests; }
    public String getMotive() { return motive; }
    public void setMotive(String motive) { this.motive = motive; }
    public String getExperience() { return experience; }
    public void setExperience(String experience) { this.experience = experience; }
    public String getExpectation() { return expectation; }
    public void setExpectation(String expectation) { this.expectation = expectation; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) {
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }
    public String getAdminNote() { return adminNote; }
    public void setAdminNote(String adminNote) {
        this.adminNote = adminNote;
        this.updatedAt = LocalDateTime.now();
    }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
