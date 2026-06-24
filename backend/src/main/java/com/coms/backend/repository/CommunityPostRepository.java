package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {
    List<CommunityPost> findAllByOrderByCreatedAtDesc();
    List<CommunityPost> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc();
    List<CommunityPost> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc(Pageable pageable);
    List<CommunityPost> findByAuthorStudentId(String authorStudentId);
    long countByAuthorStudentIdAndCreatedAtAfter(String authorStudentId, LocalDateTime createdAt);
    long countByAuthorStudentId(String authorStudentId);

    @Query("select p.authorStudentId as studentId, count(p) as count from CommunityPost p where p.authorStudentId in :studentIds group by p.authorStudentId")
    List<AuthorCount> countByAuthorStudentIds(@Param("studentIds") Collection<String> studentIds);

    interface AuthorCount {
        String getStudentId();
        long getCount();
    }
}
