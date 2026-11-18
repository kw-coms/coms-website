package com.coms.backend.repository;

import com.coms.backend.domain.HackathonEvent;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface HackathonEventRepository extends JpaRepository<HackathonEvent, Long> {
    List<HackathonEvent> findByPublishedTrueOrderByYearDescSemesterDescIdDesc();
    List<HackathonEvent> findAllByOrderByYearDescSemesterDescIdDesc();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from HackathonEvent event where event.id = :id")
    Optional<HackathonEvent> lockById(Long id);
}
