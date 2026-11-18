package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "hackathon_projects")
public class HackathonProject {
    @Id @Column(length = 40)
    private String id;
    @Column(name = "event_id", nullable = false)
    private Long eventId;
    @Column(nullable = false, length = 120)
    private String title;
    @Column(nullable = false, length = 200)
    private String author;
    @Column(nullable = false, length = 5000)
    private String description;
    @Column(length = 2000)
    private String github;
    @Column(length = 2000)
    private String live;
    @Column(nullable = false)
    private Integer position;

    public String getId() { return id; }
    public void setId(String value) { id = value; }
    public Long getEventId() { return eventId; }
    public void setEventId(Long value) { eventId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getAuthor() { return author; }
    public void setAuthor(String value) { author = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getGithub() { return github; }
    public void setGithub(String value) { github = value; }
    public String getLive() { return live; }
    public void setLive(String value) { live = value; }
    public Integer getPosition() { return position; }
    public void setPosition(Integer value) { position = value; }
}
