package com.coms.backend.repository;

import com.coms.backend.domain.RecruitPromotionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecruitPromotionLogRepository extends JpaRepository<RecruitPromotionLog, Long> {
    List<RecruitPromotionLog> findTop100ByOrderByPromotedAtDescIdDesc();
}
