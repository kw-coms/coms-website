package com.coms.backend.repository;

import com.coms.backend.domain.TeamProjectTeam;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TeamProjectTeamRepository extends JpaRepository<TeamProjectTeam, Long> {
    List<TeamProjectTeam> findByProgramIdOrderByIdAsc(Long programId);
    Optional<TeamProjectTeam> findByProgramIdAndId(Long programId, Long id);
    boolean existsByProgramIdAndNameIgnoreCase(Long programId, String name);
    boolean existsByProgramIdAndNameIgnoreCaseAndIdNot(Long programId, String name, Long id);

    /** 팀 단위 쓰기(제출·삭제·팀원 변경)를 한 줄로 세운다. 대기는 3초까지만. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("select t from TeamProjectTeam t where t.id = :id")
    Optional<TeamProjectTeam> lockById(Long id);

    /** 프로그램·일정 삭제가 진행 중인 제출을 기다리도록 모든 팀을 id 순서로 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("select t from TeamProjectTeam t where t.programId = :programId order by t.id")
    List<TeamProjectTeam> lockByProgramId(Long programId);
}
