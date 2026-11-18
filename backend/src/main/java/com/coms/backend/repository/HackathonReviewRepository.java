package com.coms.backend.repository;

import com.coms.backend.domain.HackathonReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HackathonReviewRepository extends JpaRepository<HackathonReview, Long> {
    boolean existsByProjectIdAndGenerationAndNameKey(String projectId, Integer generation, String nameKey);
    Optional<HackathonReview> findByProjectIdAndGenerationAndNameKey(String projectId, Integer generation, String nameKey);
    List<HackathonReview> findAllByOrderByCreatedAtAscIdAsc();
}
