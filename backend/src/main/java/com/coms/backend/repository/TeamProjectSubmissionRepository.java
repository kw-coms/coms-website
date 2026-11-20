package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectSubmission;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TeamProjectSubmissionRepository extends JpaRepository<TeamProjectSubmission, Long> {
    List<TeamProjectSubmission> findByProgramId(Long programId);
    List<TeamProjectSubmission> findByTeamIdOrderByIdAsc(Long teamId);
    List<TeamProjectSubmission> findByMilestoneId(Long milestoneId);
    Optional<TeamProjectSubmission> findByTeamIdAndMilestoneId(Long teamId, Long milestoneId);
}
