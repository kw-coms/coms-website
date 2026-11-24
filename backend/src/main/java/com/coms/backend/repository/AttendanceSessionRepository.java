package com.coms.backend.repository;

import com.coms.backend.domain.AttendanceSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AttendanceSessionRepository extends JpaRepository<AttendanceSession, Long> {
    List<AttendanceSession> findTop100ByStudySessionIdIsNullOrderByOpenedAtDescIdDesc();

    Optional<AttendanceSession> findByStudySessionId(Long studySessionId);

    boolean existsByStudySessionId(Long studySessionId);

    List<AttendanceSession> findByStudySessionIdIn(Collection<Long> studySessionIds);

    Optional<OpenCodeMatch> findFirstByCodeAndClosedAtIsNullAndClosesAtAfterOrderById(String code, LocalDateTime now);

    interface OpenCodeMatch {
        Long getId();
        Long getStudySessionId();
    }

    /** Sessions members can still check in to. */
    List<AttendanceSession> findByClosedAtIsNullAndClosesAtAfter(LocalDateTime now);

    List<AttendanceSession> findByOpenedByStudentId(String openedByStudentId);
}
