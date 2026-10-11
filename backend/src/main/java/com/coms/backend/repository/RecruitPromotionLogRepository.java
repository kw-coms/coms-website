package com.coms.backend.repository;

import com.coms.backend.domain.RecruitPromotionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecruitPromotionLogRepository extends JpaRepository<RecruitPromotionLog, Long> {
    List<RecruitPromotionLog> findTop100ByOrderByPromotedAtDescIdDesc();

    Optional<RecruitPromotionLog> findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc(String studentId, String name);
}
