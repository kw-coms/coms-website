package com.coms.backend.repository;

import com.coms.backend.domain.AppCatalogEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AppCatalogRepository extends JpaRepository<AppCatalogEntry, Long> {
    List<AppCatalogEntry> findAllByOrderBySortOrderAscIdAsc();
}
