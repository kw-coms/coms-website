package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "archive_attachments")
public class ArchiveAttachment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "archive_file_id", nullable = false)
    private Long archiveFileId;

    @Column(nullable = false)
    private String originalName;

    @Column(nullable = false)
    private String storedName;

    @Column(nullable = false)
    private String mimeType;

    @Column(nullable = false)
    private long fileSize;

    @Column(nullable = false)
    private int position;

    public ArchiveAttachment() {}

    public ArchiveAttachment(Long archiveFileId, String originalName, String storedName, String mimeType, long fileSize, int position) {
        this.archiveFileId = archiveFileId;
        this.originalName = originalName;
        this.storedName = storedName;
        this.mimeType = mimeType;
        this.fileSize = fileSize;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getArchiveFileId() { return archiveFileId; }
    public String getOriginalName() { return originalName; }
    public String getStoredName() { return storedName; }
    public String getMimeType() { return mimeType; }
    public long getFileSize() { return fileSize; }
    public int getPosition() { return position; }
}
