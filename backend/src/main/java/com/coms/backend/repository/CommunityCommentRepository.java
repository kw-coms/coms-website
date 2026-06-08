package com.coms.backend.repository;

import com.coms.backend.domain.CommunityComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);
    List<CommunityComment> findByParentCommentId(Long parentCommentId);
    boolean existsByParentCommentId(Long parentCommentId);
    void deleteByPostId(Long postId);
    long countByPostId(Long postId);

    @Query("select c.postId as postId, count(c) as count from CommunityComment c where c.postId in :postIds group by c.postId")
    List<CommentCount> countByPostIds(@Param("postIds") List<Long> postIds);

    interface CommentCount {
        Long getPostId();
        long getCount();
    }
}
