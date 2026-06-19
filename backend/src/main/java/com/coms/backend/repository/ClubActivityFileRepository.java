package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivityFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ClubActivityFileRepository extends JpaRepository<ClubActivityFile, Long> {
    List<ClubActivityFile> findByClubActivityIdOrderByPositionAsc(Long clubActivityId);
    List<ClubActivityFile> findByClubActivityIdInOrderByPositionAsc(Collection<Long> clubActivityIds);
    void deleteByClubActivityId(Long clubActivityId);
}
