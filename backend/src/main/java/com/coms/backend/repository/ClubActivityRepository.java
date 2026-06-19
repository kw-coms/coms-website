package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ClubActivityRepository extends JpaRepository<ClubActivity, Long> {
    List<ClubActivity> findAllByOrderByEventDateDescCreatedAtDesc();

    long countByCategory(String category);

    @Query("SELECT a.category AS category, COUNT(a) AS total FROM ClubActivity a GROUP BY a.category")
    List<Object[]> countByCategory();
}
