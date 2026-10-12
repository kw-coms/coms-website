package com.coms.backend.repository;

import com.coms.backend.domain.MeetingPollAvailability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MeetingPollAvailabilityRepository extends JpaRepository<MeetingPollAvailability, Long> {
    List<MeetingPollAvailability> findByPollIdOrderByUpdatedAtAscIdAsc(Long pollId);

    List<MeetingPollAvailability> findByPollIdIn(Collection<Long> pollIds);

    Optional<MeetingPollAvailability> findByPollIdAndStudentId(Long pollId, String studentId);

    void deleteByPollId(Long pollId);

    void deleteByPollIdAndStudentId(Long pollId, String studentId);

    void deleteByStudentId(String studentId);
}
