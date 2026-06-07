package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommunityPostFileRepository extends JpaRepository<CommunityPostFile, Long> {
    List<CommunityPostFile> findByPostIdOrderByPositionAsc(Long postId);
    void deleteByPostId(Long postId);
}
