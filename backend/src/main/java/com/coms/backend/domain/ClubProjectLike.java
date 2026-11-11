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
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

@Entity
@Table(name = "club_project_likes", uniqueConstraints =
        @UniqueConstraint(name = "uq_club_project_likes_member", columnNames = {"club_project_id", "student_id"}))
public class ClubProjectLike {
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

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public ClubProjectLike() {}

    public ClubProjectLike(Long clubProjectId, String studentId) {
        this.clubProjectId = clubProjectId;
        this.studentId = studentId;
    }

    public Long getId() { return id; }
    public Long getClubProjectId() { return clubProjectId; }
    public String getStudentId() { return studentId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
