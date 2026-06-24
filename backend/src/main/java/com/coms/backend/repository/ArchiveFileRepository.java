package com.coms.backend.repository;

import com.coms.backend.domain.ArchiveFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ArchiveFileRepository extends JpaRepository<ArchiveFile, Long> {
    List<ArchiveFile> findAllByOrderByUploadedAtDesc();

    @Modifying
    @Query("UPDATE ArchiveFile a SET a.viewCount = a.viewCount + 1 WHERE a.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
