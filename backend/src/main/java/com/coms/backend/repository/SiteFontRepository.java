package com.coms.backend.repository;

import com.coms.backend.domain.SiteFont;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SiteFontRepository extends JpaRepository<SiteFont, Long> {
    List<SiteFont> findAllByOrderByCreatedAtDesc();
    List<SiteFont> findByActiveTrueOrderByNameAsc();
}
