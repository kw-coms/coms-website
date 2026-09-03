package com.coms.backend.repository;

import com.coms.backend.domain.SponsorTier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SponsorTierRepository extends JpaRepository<SponsorTier, Long> {
    List<SponsorTier> findAllByOrderBySortOrderAscIdAsc();
}
