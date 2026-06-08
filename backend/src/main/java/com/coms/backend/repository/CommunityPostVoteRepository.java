package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CommunityPostVoteRepository extends JpaRepository<CommunityPostVote, Long> {
    List<CommunityPostVote> findByPostIdIn(Collection<Long> postIds);
    Optional<CommunityPostVote> findByPostAndStudentId(CommunityPost post, String studentId);
    void deleteByPost(CommunityPost post);
    void deleteByStudentId(String studentId);
}
