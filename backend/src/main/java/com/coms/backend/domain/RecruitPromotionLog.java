package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Snapshot of a recruit application at the moment an admin decided its outcome (합격 →
 * 명부 이관, 또는 불합격 → 삭제). The application row itself is deleted either way, so
 * this log is the durable record — despite the table name, it now holds BOTH decisions.
 */
@Entity
@Table(name = "recruit_promotion_logs")
public class RecruitPromotionLog {

    public enum Decision {
        ACCEPTED, REJECTED
    }

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

    // 불합격자는 연락처를 보존하지 않는다(개인정보 최소 보유 원칙) — 이 경우 null.
    @Column(length = 30)
    private String phone;

    @Column(length = 255)
    private String email;

    @Column(length = 10)
    private String generation;

    @Column(length = 30)
    private String promotedBy;

    /**
     * 처리 결과(합격/불합격). columnDefinition 이 DEFAULT 를 들고 있어야 hibernate 가
     * 만든 스키마 위에 V89 를 재생해도 깨지지 않는다.
     */
    @Column(name = "decision", nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED'")
    @Enumerated(EnumType.STRING)
    private Decision decision = Decision.ACCEPTED;

    @Column(name = "admin_note", length = 500)
    private String adminNote;

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
    public Decision getDecision() { return decision; }
    public void setDecision(Decision decision) { this.decision = decision; }
    public String getAdminNote() { return adminNote; }
    public void setAdminNote(String adminNote) { this.adminNote = adminNote; }
    public LocalDateTime getPromotedAt() { return promotedAt; }
    public void setPromotedAt(LocalDateTime promotedAt) { this.promotedAt = promotedAt; }
}
