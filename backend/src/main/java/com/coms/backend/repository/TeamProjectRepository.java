package com.coms.backend.repository;

import com.coms.backend.domain.TeamProject;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface TeamProjectRepository extends JpaRepository<TeamProject, Long> {
    List<TeamProject> findAllByOrderByIdDesc();
    /** Serializes team/member writes of one program so "one team per member" holds under concurrency. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from TeamProject p where p.id = :id")
    Optional<TeamProject> lockById(Long id);
}
