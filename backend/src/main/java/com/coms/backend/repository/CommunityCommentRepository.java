package com.coms.backend.repository;

import com.coms.backend.domain.CommunityComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);
    List<CommunityComment> findByParentCommentId(Long parentCommentId);
    List<CommunityComment> findByStudentId(String studentId);
    boolean existsByParentCommentId(Long parentCommentId);
    void deleteByPostId(Long postId);
    long countByPostId(Long postId);
    long countByStudentId(String studentId);

    @Query("select c.postId as postId, count(c) as count from CommunityComment c where c.postId in :postIds group by c.postId")
    List<CommentCount> countByPostIds(@Param("postIds") List<Long> postIds);

    @Query("select c.studentId as studentId, count(c) as count from CommunityComment c where c.studentId in :studentIds group by c.studentId")
    List<AuthorCount> countByStudentIds(@Param("studentIds") java.util.Collection<String> studentIds);

    interface CommentCount {
        Long getPostId();
        long getCount();
    }

    interface AuthorCount {
        String getStudentId();
        long getCount();
    }
}
