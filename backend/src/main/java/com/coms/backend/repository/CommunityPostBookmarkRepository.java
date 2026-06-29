package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostBookmark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface CommunityPostBookmarkRepository extends JpaRepository<CommunityPostBookmark, Long> {
    boolean existsByPostIdAndStudentId(Long postId, String studentId);
    void deleteByPostIdAndStudentId(Long postId, String studentId);
    List<CommunityPostBookmark> findByStudentIdOrderByCreatedAtDesc(String studentId);
    @Query("select b.post from CommunityPostBookmark b where b.studentId = :studentId order by b.createdAt desc")
    List<CommunityPost> findBookmarkedPostsByStudentId(@Param("studentId") String studentId);
    List<CommunityPostBookmark> findByPostIdInAndStudentId(Collection<Long> postIds, String studentId);
    long countByPostId(Long postId);
    void deleteByPostId(Long postId);
    void deleteByStudentId(String studentId);
}
