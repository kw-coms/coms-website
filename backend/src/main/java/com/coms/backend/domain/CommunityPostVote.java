package com.coms.backend.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "community_post_votes",
        uniqueConstraints = @UniqueConstraint(name = "uk_community_post_votes_post_student", columnNames = {"post_id", "student_id"})
)
public class CommunityPostVote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "post_id", nullable = false)
    private CommunityPost post;

    @Column(name = "student_id", nullable = false)
    private String studentId;

    @Column(name = "vote_value", nullable = false)
    private int value;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public CommunityPost getPost() { return post; }
    public void setPost(CommunityPost post) { this.post = post; }
    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public int getValue() { return value; }
    public void setValue(int value) { this.value = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
