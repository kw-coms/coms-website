package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "club_activity_files")
public class ClubActivityFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_activity_id", nullable = false)
    private Long clubActivityId;

    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(nullable = false)
    private int position;

    public ClubActivityFile() {}

    public ClubActivityFile(Long clubActivityId, String storedName, String originalName, String mimeType, int position) {
        this.clubActivityId = clubActivityId;
        this.storedName = storedName;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getClubActivityId() { return clubActivityId; }
    public String getStoredName() { return storedName; }
    public String getOriginalName() { return originalName; }
    public String getMimeType() { return mimeType; }
    public int getPosition() { return position; }
}
