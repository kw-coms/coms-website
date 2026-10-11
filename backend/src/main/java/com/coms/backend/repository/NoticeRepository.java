package com.coms.backend.repository;

import com.coms.backend.domain.Notice;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NoticeRepository extends JpaRepository<Notice, Long> {
    List<Notice> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDescIdDesc();

    List<Notice> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDescIdDesc(Pageable pageable);

    /**
     * Counts a view without loading and re-saving the row. The read-modify-write this replaces
     * wrote every column back, so a view that started before an edit committed could put the old
     * title/content/pin state back, and {@code @PreUpdate} stamped {@code updatedAt} on each view.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Notice n set n.viewCount = n.viewCount + 1 where n.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
