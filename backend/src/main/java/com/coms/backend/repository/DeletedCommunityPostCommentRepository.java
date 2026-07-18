package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPostComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DeletedCommunityPostCommentRepository extends JpaRepository<DeletedCommunityPostComment, Long> {
    List<DeletedCommunityPostComment> findByDeletedPostIdOrderByDepthAscCreatedAtAsc(Long deletedPostId);
    List<DeletedCommunityPostComment> findByDeletedPostIdInOrderByDepthAscCreatedAtAsc(Collection<Long> deletedPostIds);
    long countByDeletedPostId(Long deletedPostId);
    void deleteByDeletedPostId(Long deletedPostId);
}
