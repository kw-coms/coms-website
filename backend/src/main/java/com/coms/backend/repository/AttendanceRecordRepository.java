package com.coms.backend.repository;

import com.coms.backend.domain.AttendanceRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface AttendanceRecordRepository extends JpaRepository<AttendanceRecord, Long> {
    List<AttendanceRecord> findBySessionIdOrderByCheckedAtAscIdAsc(Long sessionId);

    List<AttendanceRecord> findBySessionIdIn(Collection<Long> sessionIds);

    boolean existsBySessionIdAndStudentId(Long sessionId, String studentId);

    void deleteBySessionId(Long sessionId);

    void deleteByStudentId(String studentId);
}
