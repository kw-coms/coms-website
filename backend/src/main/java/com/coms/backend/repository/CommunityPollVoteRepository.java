package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPollVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CommunityPollVoteRepository extends JpaRepository<CommunityPollVote, Long> {
    List<CommunityPollVote> findByPostIdIn(Collection<Long> postIds);
    Optional<CommunityPollVote> findByPostIdAndPollIdAndStudentId(Long postId, String pollId, String studentId);
    void deleteByPostId(Long postId);
    void deleteByStudentId(String studentId);
}
