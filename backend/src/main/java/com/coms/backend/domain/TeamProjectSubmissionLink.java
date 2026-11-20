package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "team_project_submission_links")
public class TeamProjectSubmissionLink {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "submission_id", nullable = false)
    private Long submissionId;
    @Column(nullable = false, length = 2000)
    private String url;
    @Column(nullable = false)
    private int position;

    public Long getId() { return id; }
    public Long getSubmissionId() { return submissionId; }
    public void setSubmissionId(Long value) { submissionId = value; }
    public String getUrl() { return url; }
    public void setUrl(String value) { url = value; }
    public int getPosition() { return position; }
    public void setPosition(int value) { position = value; }
}
