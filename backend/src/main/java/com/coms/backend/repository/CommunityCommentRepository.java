package com.coms.backend.repository;

import com.coms.backend.domain.CommunityComment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);
    boolean existsByParentCommentId(Long parentCommentId);
    void deleteByPostId(Long postId);
}
