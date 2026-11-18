package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "hackathon_materials")
public class HackathonMaterial {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_id", nullable = false)
    private Long eventId;
    @Column(name = "project_id", length = 40)
    private String projectId;
    @Column(nullable = false, length = 20)
    private String kind;
    @Column(nullable = false, length = 120)
    private String label = "";
    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;
    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;
    @Column(name = "file_size", nullable = false)
    private Long fileSize;
    @Column(name = "legacy_url", length = 255)
    private String legacyUrl;
    @Column(name = "stored_name", length = 255)
    private String storedName;

    public Long getId() { return id; }
    public Long getEventId() { return eventId; }
    public void setEventId(Long value) { eventId = value; }
    public String getProjectId() { return projectId; }
    public void setProjectId(String value) { projectId = value; }
    public String getKind() { return kind; }
    public void setKind(String value) { kind = value; }
    public String getLabel() { return label; }
    public void setLabel(String value) { label = value; }
    public String getOriginalName() { return originalName; }
    public void setOriginalName(String value) { originalName = value; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String value) { mimeType = value; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long value) { fileSize = value; }
    public String getLegacyUrl() { return legacyUrl; }
    public void setLegacyUrl(String value) { legacyUrl = value; }
    public String getStoredName() { return storedName; }
    public void setStoredName(String value) { storedName = value; }
}
