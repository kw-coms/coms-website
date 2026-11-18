package com.coms.backend.repository;

import com.coms.backend.domain.HackathonProject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface HackathonProjectRepository extends JpaRepository<HackathonProject, String> {
    List<HackathonProject> findByEventIdOrderByPositionAscIdAsc(Long eventId);
    Optional<HackathonProject> findByEventIdAndId(Long eventId, String id);
    boolean existsByEventIdAndId(Long eventId, String id);
    long countByEventId(Long eventId);
    @Query("select max(project.position) from HackathonProject project where project.eventId = :eventId")
    Optional<Integer> maxPositionByEventId(Long eventId);
}
