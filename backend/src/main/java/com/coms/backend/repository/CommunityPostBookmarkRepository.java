package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostBookmark;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface CommunityPostBookmarkRepository extends JpaRepository<CommunityPostBookmark, Long> {
    boolean existsByPostIdAndStudentId(Long postId, String studentId);
    void deleteByPostIdAndStudentId(Long postId, String studentId);
    List<CommunityPostBookmark> findByStudentIdOrderByCreatedAtDesc(String studentId);
    List<CommunityPostBookmark> findByPostIdInAndStudentId(Collection<Long> postIds, String studentId);
    long countByPostId(Long postId);
    void deleteByPostId(Long postId);
    void deleteByStudentId(String studentId);
}
