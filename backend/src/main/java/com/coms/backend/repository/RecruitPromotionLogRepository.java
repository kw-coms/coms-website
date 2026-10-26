package com.coms.backend.repository;

import com.coms.backend.domain.RecruitPromotionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RecruitPromotionLogRepository extends JpaRepository<RecruitPromotionLog, Long> {
    List<RecruitPromotionLog> findTop100ByOrderByPromotedAtDescIdDesc();

    Optional<RecruitPromotionLog> findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc(String studentId, String name);

    /**
     * Retention: the decision record stays (who was accepted or rejected, and when), but the
     * applicant's phone number and e-mail address are only needed while the season is running.
     */
    @Modifying
    @Query("UPDATE RecruitPromotionLog l SET l.phone = NULL, l.email = NULL "
            + "WHERE (l.phone IS NOT NULL OR l.email IS NOT NULL) AND l.promotedAt < :before")
    int clearContactDetailsBefore(@Param("before") LocalDateTime before);
}
