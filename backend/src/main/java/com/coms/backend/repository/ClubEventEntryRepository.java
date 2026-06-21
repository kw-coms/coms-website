package com.coms.backend.repository;

import com.coms.backend.domain.ClubEventEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ClubEventEntryRepository extends JpaRepository<ClubEventEntry, Long> {
    List<ClubEventEntry> findByClubEventIdOrderByPositionAscCreatedAtAsc(Long clubEventId);
    List<ClubEventEntry> findByClubEventIdInOrderByPositionAscCreatedAtAsc(Collection<Long> clubEventIds);
    long countByClubEventId(Long clubEventId);
    void deleteByClubEventId(Long clubEventId);
}
