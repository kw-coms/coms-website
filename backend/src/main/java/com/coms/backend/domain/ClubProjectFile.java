package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "club_project_files")
public class ClubProjectFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_project_id", nullable = false)
    private Long clubProjectId;

    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(nullable = false)
    private int position;

    public ClubProjectFile() {}

    public ClubProjectFile(Long clubProjectId, String storedName, String originalName, String mimeType, long fileSize, int position) {
        this.clubProjectId = clubProjectId;
        this.storedName = storedName;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.fileSize = fileSize;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getClubProjectId() { return clubProjectId; }
    public String getStoredName() { return storedName; }
    public String getOriginalName() { return originalName; }
    public String getMimeType() { return mimeType; }
    public long getFileSize() { return fileSize; }
    public int getPosition() { return position; }
}
