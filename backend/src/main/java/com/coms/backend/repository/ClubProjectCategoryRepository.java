package com.coms.backend.repository;

import com.coms.backend.domain.ClubProjectCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClubProjectCategoryRepository extends JpaRepository<ClubProjectCategory, Long> {
    List<ClubProjectCategory> findAllByOrderByPositionAscIdAsc();
    Optional<ClubProjectCategory> findByKey(String key);
    boolean existsByKey(String key);
}
