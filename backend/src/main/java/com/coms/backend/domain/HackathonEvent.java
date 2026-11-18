package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "hackathon_events")
public class HackathonEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 120)
    private String title;
    @Column(name = "event_year", nullable = false)
    private Integer year;
    @Column(nullable = false)
    private Integer semester;
    @Column(nullable = false, length = 200)
    private String theme = "";
    @Column(nullable = false, length = 10000)
    private String introduction = "";
    @Column(nullable = false, length = 10000)
    private String rules = "";
    @Column(nullable = false)
    private boolean published;
    @Column(nullable = false)
    private boolean open;

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public Integer getYear() { return year; }
    public void setYear(Integer value) { year = value; }
    public Integer getSemester() { return semester; }
    public void setSemester(Integer value) { semester = value; }
    public String getTheme() { return theme; }
    public void setTheme(String value) { theme = value; }
    public String getIntroduction() { return introduction; }
    public void setIntroduction(String value) { introduction = value; }
    public String getRules() { return rules; }
    public void setRules(String value) { rules = value; }
    public boolean isPublished() { return published; }
    public void setPublished(boolean value) { published = value; }
    public boolean isOpen() { return open; }
    public void setOpen(boolean value) { open = value; }
}
