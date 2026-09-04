package com.coms.backend.repository;

import com.coms.backend.domain.Sponsor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SponsorRepository extends JpaRepository<Sponsor, Long> {
    List<Sponsor> findAllByOrderBySortOrderAscNameAscIdAsc();
    boolean existsByLogoImageId(Long logoImageId);
    long countByTierId(Long tierId);
}
