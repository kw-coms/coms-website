package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPostMedia;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DeletedCommunityPostMediaRepository extends JpaRepository<DeletedCommunityPostMedia, Long> {
    List<DeletedCommunityPostMedia> findByDeletedPostIdOrderByPositionAsc(Long deletedPostId);
    List<DeletedCommunityPostMedia> findByDeletedPostIdInOrderByPositionAsc(Collection<Long> deletedPostIds);
    boolean existsByStoredName(String storedName);
    void deleteByDeletedPostId(Long deletedPostId);
}
