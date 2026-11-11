package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

@Entity
@Table(name = "club_project_comments")
public class ClubProjectComment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_project_id", nullable = false)
    private Long clubProjectId;

    @Column(name = "student_id", nullable = false, length = 30)
    private String studentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", referencedColumnName = "student_id", insertable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Member member;

    @Column(name = "author_name", nullable = false, length = 100)
    private String authorName;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "parent_comment_id")
    private Long parentCommentId;

    // Match V111's cascade in Hibernate's H2 test schema as well as PostgreSQL.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_comment_id", insertable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private ClubProjectComment parent;

    @Column(nullable = false)
    private int depth;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public ClubProjectComment() {}

    public ClubProjectComment(Long clubProjectId, String studentId, String authorName,
                              String content, Long parentCommentId, int depth) {
        this.clubProjectId = clubProjectId;
        this.studentId = studentId;
        this.authorName = authorName;
        this.content = content;
        this.parentCommentId = parentCommentId;
        this.depth = depth;
    }

    public Long getId() { return id; }
    public Long getClubProjectId() { return clubProjectId; }
    public String getStudentId() { return studentId; }
    public String getAuthorName() { return authorName; }
    public String getContent() { return content; }
    public Long getParentCommentId() { return parentCommentId; }
    public int getDepth() { return depth; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public void updateContent(String content) {
        this.content = content;
        this.updatedAt = LocalDateTime.now();
    }
}
