package com.coms.backend.repository;

import com.coms.backend.domain.RecurringScheduleException;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RecurringScheduleExceptionRepository extends JpaRepository<RecurringScheduleException, Long> {

    Optional<RecurringScheduleException> findByRecurringScheduleIdAndExceptionDate(Long recurringScheduleId, LocalDate exceptionDate);

    List<RecurringScheduleException> findByRecurringScheduleIdInAndExceptionDateBetween(Collection<Long> recurringScheduleIds, LocalDate start, LocalDate end);

    void deleteByRecurringScheduleIdAndExceptionDate(Long recurringScheduleId, LocalDate exceptionDate);
}
