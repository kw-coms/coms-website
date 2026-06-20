package com.coms.backend.repository;

import com.coms.backend.domain.RecurringSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface RecurringScheduleRepository extends JpaRepository<RecurringSchedule, Long> {

    List<RecurringSchedule> findAllByOrderByStartDateDescIdDesc();

    // Definitions whose [startDate, endDate] range overlaps the given window.
    List<RecurringSchedule> findByStartDateLessThanEqualAndEndDateGreaterThanEqual(LocalDate windowEnd, LocalDate windowStart);

    long countByCategory(String category);
}
