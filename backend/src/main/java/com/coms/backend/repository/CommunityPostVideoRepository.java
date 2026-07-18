package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostVideo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface CommunityPostVideoRepository extends JpaRepository<CommunityPostVideo, Long> {
    List<CommunityPostVideo> findByPostIdOrderByPositionAsc(Long postId);
    List<CommunityPostVideo> findByPostIdInOrderByPositionAsc(Collection<Long> postIds);
    void deleteByPostId(Long postId);
}
