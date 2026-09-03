package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "eligible_members")
public class EligibleMember {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String studentId;

    @Column(nullable = false)
    private String name;

    private String phone;

    private String generation;

    private Integer admissionYear;

    @Column(unique = true)
    private String verificationKey;

    @Column(columnDefinition = "TEXT")
    private String note;

    /**
     * 이 명부 행으로 가입할 때 부여할 등급. 리크루팅 합격 이관은 ASSOCIATE(준회원),
     * 관리자가 직접 등록한 행은 USER(회원). columnDefinition 이 DEFAULT 를 들고 있어야
     * hibernate 가 만든 스키마 위에 V87 을 재생해도 깨지지 않는다.
     */
    @Column(name = "initial_role", nullable = false, length = 20,
            columnDefinition = "VARCHAR(20) NOT NULL DEFAULT 'USER'")
    @Enumerated(EnumType.STRING)
    private Member.Role initialRole = Member.Role.USER;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getGeneration() { return generation; }
    public void setGeneration(String generation) { this.generation = generation; }
    public Integer getAdmissionYear() { return admissionYear; }
    public void setAdmissionYear(Integer admissionYear) { this.admissionYear = admissionYear; }
    public String getVerificationKey() { return verificationKey; }
    public void setVerificationKey(String verificationKey) { this.verificationKey = verificationKey; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Member.Role getInitialRole() { return initialRole; }
    public void setInitialRole(Member.Role initialRole) { this.initialRole = initialRole; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
