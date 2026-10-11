package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ClubActivityRepository extends JpaRepository<ClubActivity, Long> {
    List<ClubActivity> findAllByOrderByEventDateDescCreatedAtDesc();

    long countByCategory(String category);

    /** Atomic view counter; see NoticeRepository#incrementViewCount for why not load-and-save. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update ClubActivity a set a.viewCount = a.viewCount + 1 where a.id = :id")
    int incrementViewCount(@Param("id") Long id);

    @Query("SELECT a.category AS category, COUNT(a) AS total FROM ClubActivity a GROUP BY a.category")
    List<Object[]> countByCategory();
}
