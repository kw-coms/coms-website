package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Entity
@Table(name = "study_group_members", uniqueConstraints = @UniqueConstraint(name = "uk_study_group_member", columnNames = {"group_id", "student_id"}))
public class StudyGroupMember {
    public enum Role { LEADER, MEMBER }
    public enum Status { PENDING, APPROVED }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "group_id", nullable = false) private Long groupId;
    @Column(name = "student_id", nullable = false, length = 50) private String studentId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Role role = Role.MEMBER;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Status status = Status.PENDING;
    @Column(name = "joined_at", nullable = false) private LocalDateTime joinedAt = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
    public Long getId() { return id; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long value) { groupId = value; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String value) { studentId = value; }
    public Role getRole() { return role; }
    public void setRole(Role value) { role = value; }
    public Status getStatus() { return status; }
    public void setStatus(Status value) { status = value; }
    public LocalDateTime getJoinedAt() { return joinedAt; }
    public void setJoinedAt(LocalDateTime value) { joinedAt = value; }
}
