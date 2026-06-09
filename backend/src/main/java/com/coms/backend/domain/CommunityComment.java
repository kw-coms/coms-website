package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "community_comments")
public class CommunityComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long postId;

    @Column(nullable = false, length = 50)
    private String studentId;

    @Column(nullable = false, length = 100)
    private String authorName;

    @Column(name = "anonymous_name", length = 20)
    private String anonymousName;

    @Column(name = "ip_address", length = 80)
    private String ipAddress;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    private Long parentCommentId;

    @Column(nullable = false)
    private int depth = 0;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(nullable = false)
    private boolean edited = false;

    public CommunityComment() {}

    public CommunityComment(Long postId, String studentId, String authorName, String content, Long parentCommentId, int depth) {
        this.postId = postId;
        this.studentId = studentId;
        this.authorName = authorName;
        this.content = content;
        this.parentCommentId = parentCommentId;
        this.depth = depth;
    }

    public Long getId() { return id; }
    public Long getPostId() { return postId; }
    public String getStudentId() { return studentId; }
    public String getAuthorName() { return authorName; }
    public String getAnonymousName() { return anonymousName; }
    public void setAnonymousName(String anonymousName) { this.anonymousName = anonymousName; }
    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }
    public String getContent() { return content; }
    public Long getParentCommentId() { return parentCommentId; }
    public int getDepth() { return depth; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public boolean isEdited() { return edited; }

    public void markEdited(String content) {
        this.content = content;
        this.updatedAt = LocalDateTime.now();
        this.edited = true;
    }
}
