package com.coms.backend.repository;

import com.coms.backend.domain.RecruitApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RecruitApplicationRepository extends JpaRepository<RecruitApplication, Long> {
    List<RecruitApplication> findAllByOrderBySubmittedAtDescIdDesc();
    long countByStatus(RecruitApplication.Status status);
    Optional<RecruitApplication> findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(String studentId, String name);

    void deleteByStudentId(String studentId);

    @Query("select r.submittedAt from RecruitApplication r where r.submittedAt >= :since")
    List<LocalDateTime> findSubmittedAtSince(@Param("since") LocalDateTime since);
}
