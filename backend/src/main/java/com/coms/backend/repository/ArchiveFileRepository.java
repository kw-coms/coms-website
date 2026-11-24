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

    @Query("""
            select a from ArchiveFile a where
              :admin = true or a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.PUBLIC or
              (:studentId is not null and (
                a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.MEMBERS or
                (:officer = true and a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.OFFICERS) or
                (a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.SELECTED and
                  (a.uploadedBy = :studentId or :studentId member of a.selectedStudentIds))))
            order by a.uploadedAt desc
            """)
    List<ArchiveFile> findVisible(@Param("studentId") String studentId, @Param("officer") boolean officer,
                                  @Param("admin") boolean admin, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ArchiveFile a where a.id = :id")
    Optional<ArchiveFile> findByIdForUpdate(@Param("id") Long id);

    @Modifying
    @Query("UPDATE ArchiveFile a SET a.viewCount = a.viewCount + 1 WHERE a.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
