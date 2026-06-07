package com.coms.backend.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "community_post_videos")
public class CommunityPostVideo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long postId;

    @Column(nullable = false, length = 255)
    private String storedName;

    @Column(length = 255)
    private String originalName;

    @Column(length = 100)
    private String mimeType;

    @Column(nullable = false)
    private int position;

    public CommunityPostVideo() {}

    public CommunityPostVideo(Long postId, String storedName, String originalName, String mimeType, int position) {
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
