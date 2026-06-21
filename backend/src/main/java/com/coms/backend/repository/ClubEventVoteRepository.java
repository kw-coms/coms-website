package com.coms.backend.repository;

import com.coms.backend.domain.ClubEventVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubEventVoteRepository extends JpaRepository<ClubEventVote, Long> {
    List<ClubEventVote> findByClubEventIdIn(Collection<Long> clubEventIds);
    List<ClubEventVote> findByClubEventId(Long clubEventId);
    Optional<ClubEventVote> findByClubEventIdAndStudentId(Long clubEventId, String studentId);
    void deleteByClubEventId(Long clubEventId);
    void deleteByEntryId(Long entryId);
    void deleteByStudentId(String studentId);
}
