package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "team_project_teams")
public class TeamProjectTeam {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_id", nullable = false)
    private Long programId;
    @Column(nullable = false, length = 60)
    private String name;
    @Column(nullable = false, length = 200)
    private String topic = "";
    @Column(nullable = false, length = 2000)
    private String intro = "";

    public Long getId() { return id; }
    public Long getProgramId() { return programId; }
    public void setProgramId(Long value) { programId = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getTopic() { return topic; }
    public void setTopic(String value) { topic = value; }
    public String getIntro() { return intro; }
    public void setIntro(String value) { intro = value; }
}
