package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPostReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CommunityPostReportRepository extends JpaRepository<CommunityPostReport, Long> {
    Optional<CommunityPostReport> findByPostIdAndReporterStudentIdAndStatus(Long postId, String reporterStudentId, CommunityPostReport.Status status);

    List<CommunityPostReport> findByStatusOrderByCreatedAtDesc(CommunityPostReport.Status status);
}
