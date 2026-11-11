package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "club_project_images")
public class ClubProjectImage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "club_project_id", nullable = false)
    private Long clubProjectId;
    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;
    @Column(name = "mime_type", nullable = false, length = 20)
    private String mimeType;
    @Column(nullable = false)
    private int position;

    public ClubProjectImage() {}
    public ClubProjectImage(Long clubProjectId, String storedName, String mimeType, int position) {
        this.clubProjectId = clubProjectId;
        this.storedName = storedName;
        this.mimeType = mimeType;
        this.position = position;
    }
    public Long getId() { return id; }
    public Long getClubProjectId() { return clubProjectId; }
    public String getStoredName() { return storedName; }
    public String getMimeType() { return mimeType; }
    public int getPosition() { return position; }
}
