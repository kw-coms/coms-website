package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivityCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClubActivityCategoryRepository extends JpaRepository<ClubActivityCategory, Long> {
    List<ClubActivityCategory> findAllByOrderByPositionAscIdAsc();
    Optional<ClubActivityCategory> findByKey(String key);
    boolean existsByKey(String key);
}
