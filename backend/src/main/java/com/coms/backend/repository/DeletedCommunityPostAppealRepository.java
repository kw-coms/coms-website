package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPostAppeal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DeletedCommunityPostAppealRepository extends JpaRepository<DeletedCommunityPostAppeal, Long> {
    boolean existsByDeletedPostIdAndRequesterStudentIdAndStatus(Long deletedPostId, String requesterStudentId, DeletedCommunityPostAppeal.Status status);
    List<DeletedCommunityPostAppeal> findByDeletedPostIdInOrderByCreatedAtDesc(Collection<Long> deletedPostIds);
}
