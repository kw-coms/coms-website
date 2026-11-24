package com.coms.backend.repository;

import com.coms.backend.domain.StudyGroup;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface StudyGroupRepository extends JpaRepository<StudyGroup, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from StudyGroup g where g.id = :id")
    Optional<StudyGroup> findByIdForUpdate(@Param("id") Long id);
    List<StudyGroup> findAllByOrderByCreatedAtDescIdDesc();
    List<StudyGroup> findByLeaderStudentId(String studentId);
    List<StudyGroup> findByCreatedBy(String studentId);
}
