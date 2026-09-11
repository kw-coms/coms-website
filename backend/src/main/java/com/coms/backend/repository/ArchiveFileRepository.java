package com.coms.backend.repository;

import com.coms.backend.domain.ArchiveFile;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ArchiveFileRepository extends JpaRepository<ArchiveFile, Long> {
    List<ArchiveFile> findAllByOrderByUploadedAtDesc();

    List<ArchiveFile> findAllByOrderByUploadedAtDesc(Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ArchiveFile a where a.id = :id")
    Optional<ArchiveFile> findByIdForUpdate(@Param("id") Long id);

    @Modifying
    @Query("UPDATE ArchiveFile a SET a.viewCount = a.viewCount + 1 WHERE a.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
