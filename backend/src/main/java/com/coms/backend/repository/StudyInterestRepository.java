package com.coms.backend.repository;

import com.coms.backend.domain.StudyInterest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface StudyInterestRepository extends JpaRepository<StudyInterest, Long> {
    Optional<StudyInterest> findByGroupIdAndStudentId(Long groupId, String studentId);
    List<StudyInterest> findByGroupId(Long groupId);
    long countByGroupId(Long groupId);
    void deleteByGroupIdAndStudentId(Long groupId, String studentId);
    void deleteByStudentId(String studentId);
}
