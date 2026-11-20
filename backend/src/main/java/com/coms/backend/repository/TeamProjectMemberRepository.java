package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TeamProjectMemberRepository extends JpaRepository<TeamProjectMember, Long> {
    List<TeamProjectMember> findByProgramIdOrderByIdAsc(Long programId);
    List<TeamProjectMember> findByTeamId(Long teamId);
    List<TeamProjectMember> findByStudentId(String studentId);
    Optional<TeamProjectMember> findByProgramIdAndStudentId(Long programId, String studentId);
    boolean existsByTeamIdAndStudentId(Long teamId, String studentId);
    Optional<TeamProjectMember> findByTeamIdAndStudentId(Long teamId, String studentId);
}
