package com.coms.backend.repository;

import com.coms.backend.domain.Gathering;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

public interface GatheringRepository extends JpaRepository<Gathering, Long> {
    List<Gathering> findTop100ByOrderByCreatedAtDescIdDesc();

    @Query("select g from Gathering g where g.opportunityId is not null and g.closedAt is null and (g.closesAt is null or g.closesAt > :now) order by g.createdAt desc, g.id desc")
    List<Gathering> findOpenOpportunityGatherings(@Param("now") LocalDateTime now);

    List<Gathering> findByCreatorStudentId(String creatorStudentId);

    long countByCreatorStudentId(String creatorStudentId);

    /** The gathering, locked until the transaction ends: sign-ups to one gathering go one at a time. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from Gathering g where g.id = :id")
    Optional<Gathering> findByIdForUpdate(@Param("id") Long id);
}
