package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Snapshot of a recruit application at the moment it was promoted (합격 → 명부 이관).
 * The application row itself is deleted on promotion, so this log is the durable record.
 */
@Entity
@Table(name = "recruit_promotion_logs")
public class RecruitPromotionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long applicationId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 30)
    private String studentId;

    @Column(length = 100)
    private String department;

    @Column(length = 30)
    private String phone;

    @Column(length = 255)
    private String email;

    @Column(length = 10)
    private String generation;

    @Column(length = 30)
    private String promotedBy;

    @Column(nullable = false)
    private LocalDateTime promotedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getGeneration() { return generation; }
    public void setGeneration(String generation) { this.generation = generation; }
    public String getPromotedBy() { return promotedBy; }
    public void setPromotedBy(String promotedBy) { this.promotedBy = promotedBy; }
    public LocalDateTime getPromotedAt() { return promotedAt; }
    public void setPromotedAt(LocalDateTime promotedAt) { this.promotedAt = promotedAt; }
}
