package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivityVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubActivityVoteRepository extends JpaRepository<ClubActivityVote, Long> {
    List<ClubActivityVote> findByClubActivityIdIn(Collection<Long> clubActivityIds);
    Optional<ClubActivityVote> findByClubActivityIdAndStudentId(Long clubActivityId, String studentId);
    void deleteByStudentId(String studentId);
}
