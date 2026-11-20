package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectMilestone;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TeamProjectMilestoneRepository extends JpaRepository<TeamProjectMilestone, Long> {
    List<TeamProjectMilestone> findByProgramIdOrderByPositionAscIdAsc(Long programId);
    Optional<TeamProjectMilestone> findByProgramIdAndId(Long programId, Long id);
}
