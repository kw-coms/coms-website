package com.coms.backend.repository;

import com.coms.backend.domain.ClubEventRsvp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClubEventRsvpRepository extends JpaRepository<ClubEventRsvp, Long> {
    List<ClubEventRsvp> findByClubEventIdIn(Collection<Long> clubEventIds);
    List<ClubEventRsvp> findByClubEventId(Long clubEventId);
    Optional<ClubEventRsvp> findByClubEventIdAndStudentId(Long clubEventId, String studentId);
    long countByClubEventIdAndStatus(Long clubEventId, ClubEventRsvp.Status status);
    void deleteByClubEventId(Long clubEventId);
    void deleteByStudentId(String studentId);
}
