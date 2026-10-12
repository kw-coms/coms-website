package com.coms.backend.repository;

import com.coms.backend.domain.AttendanceSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface AttendanceSessionRepository extends JpaRepository<AttendanceSession, Long> {
    List<AttendanceSession> findTop100ByOrderByOpenedAtDescIdDesc();

    /** Sessions members can still check in to. */
    List<AttendanceSession> findByClosedAtIsNullAndClosesAtAfter(LocalDateTime now);

    List<AttendanceSession> findByOpenedByStudentId(String openedByStudentId);
}
