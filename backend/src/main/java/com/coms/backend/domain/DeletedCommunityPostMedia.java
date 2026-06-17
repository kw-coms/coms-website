package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "deleted_community_post_media", indexes = {
        @Index(name = "idx_deleted_cpm_deleted_post_id", columnList = "deleted_post_id, position"),
        @Index(name = "idx_deleted_cpm_original_media_id", columnList = "original_media_id"),
        @Index(name = "idx_deleted_cpm_stored_name", columnList = "stored_name")
})
public class DeletedCommunityPostMedia {
    public static final String KIND_VIDEO = "VIDEO";
    public static final String KIND_FILE = "FILE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deleted_post_id", nullable = false)
    private Long deletedPostId;

    @Column(name = "original_media_id", nullable = false)
    private Long originalMediaId;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(name = "stored_name", nullable = false, length = 255)
    private String storedName;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(nullable = false)
    private int position;

    public DeletedCommunityPostMedia() {}

    public DeletedCommunityPostMedia(Long deletedPostId,
                                     Long originalMediaId,
                                     String kind,
                                     String storedName,
                                     String originalName,
                                     String mimeType,
                                     int position) {
        this.deletedPostId = deletedPostId;
        this.originalMediaId = originalMediaId;
        this.kind = kind;
        this.storedName = storedName;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getDeletedPostId() { return deletedPostId; }
    public Long getOriginalMediaId() { return originalMediaId; }
    public String getKind() { return kind; }
    public String getStoredName() { return storedName; }
    public String getOriginalName() { return originalName; }
    public String getMimeType() { return mimeType; }
    public int getPosition() { return position; }
}
