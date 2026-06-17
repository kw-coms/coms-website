package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPostImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DeletedCommunityPostImageRepository extends JpaRepository<DeletedCommunityPostImage, Long> {
    List<DeletedCommunityPostImage> findByDeletedPostIdOrderByPositionAsc(Long deletedPostId);
    boolean existsByStoredName(String storedName);
    void deleteByDeletedPostId(Long deletedPostId);
}
