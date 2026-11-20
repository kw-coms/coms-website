package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectTeam;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TeamProjectTeamRepository extends JpaRepository<TeamProjectTeam, Long> {
    List<TeamProjectTeam> findByProgramIdOrderByIdAsc(Long programId);
    Optional<TeamProjectTeam> findByProgramIdAndId(Long programId, Long id);
    boolean existsByProgramIdAndNameIgnoreCase(Long programId, String name);
    boolean existsByProgramIdAndNameIgnoreCaseAndIdNot(Long programId, String name, Long id);
}
