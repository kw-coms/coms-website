package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostVideo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommunityPostVideoRepository extends JpaRepository<CommunityPostVideo, Long> {
    List<CommunityPostVideo> findByPostIdOrderByPositionAsc(Long postId);
    void deleteByPostId(Long postId);
}
