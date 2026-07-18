package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface CommunityPostFileRepository extends JpaRepository<CommunityPostFile, Long> {
    List<CommunityPostFile> findByPostIdOrderByPositionAsc(Long postId);
    List<CommunityPostFile> findByPostIdInOrderByPositionAsc(Collection<Long> postIds);
    void deleteByPostId(Long postId);
}
