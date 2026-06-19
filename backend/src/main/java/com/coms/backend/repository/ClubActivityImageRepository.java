package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivityImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ClubActivityImageRepository extends JpaRepository<ClubActivityImage, Long> {
    List<ClubActivityImage> findByClubActivityIdOrderByPositionAsc(Long clubActivityId);
    List<ClubActivityImage> findByClubActivityIdInOrderByPositionAsc(Collection<Long> clubActivityIds);
    void deleteByClubActivityId(Long clubActivityId);
}
