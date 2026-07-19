package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface CommunityPostImageRepository extends JpaRepository<CommunityPostImage, Long> {
    List<CommunityPostImage> findByPostIdOrderByPositionAsc(Long postId);
    List<CommunityPostImage> findByPostIdInOrderByPositionAsc(Collection<Long> postIds);
    void deleteByPostId(Long postId);
}
