package com.coms.backend.repository;

import com.coms.backend.domain.RecruitApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecruitApplicationRepository extends JpaRepository<RecruitApplication, Long> {
    List<RecruitApplication> findAllByOrderBySubmittedAtDescIdDesc();
    long countByStatus(RecruitApplication.Status status);
}
