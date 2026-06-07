package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "community_post_files")
public class CommunityPostFile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false)
    private Long postId;
    @Column(nullable = false)
    private String storedName;
    @Column(nullable = false)
    private String originalName;
    @Column(nullable = false)
    private String mimeType;
    @Column(nullable = false)
    private int position;

    public CommunityPostFile() {}

    public CommunityPostFile(Long postId, String storedName, String originalName, String mimeType, int position) {
        this.postId = postId;
        this.storedName = storedName;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getPostId() { return postId; }
    public String getStoredName() { return storedName; }
    public String getOriginalName() { return originalName; }
    public String getMimeType() { return mimeType; }
    public int getPosition() { return position; }
}
