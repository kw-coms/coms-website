package com.coms.backend.repository;

import com.coms.backend.domain.RecruitApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecruitApplicationRepository extends JpaRepository<RecruitApplication, Long> {
    List<RecruitApplication> findAllByOrderBySubmittedAtDescIdDesc();
    long countByStatus(RecruitApplication.Status status);
    Optional<RecruitApplication> findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(String studentId, String name);
}
