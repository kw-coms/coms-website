package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "team_project_members")
public class TeamProjectMember {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_id", nullable = false)
    private Long programId;
    @Column(name = "team_id", nullable = false)
    private Long teamId;
    @Column(name = "student_id", nullable = false)
    private String studentId;

    public Long getId() { return id; }
    public Long getProgramId() { return programId; }
    public void setProgramId(Long value) { programId = value; }
    public Long getTeamId() { return teamId; }
    public void setTeamId(Long value) { teamId = value; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String value) { studentId = value; }
}
