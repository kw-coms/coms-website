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
              a.studyGroupId is null and (
              :admin = true or a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.PUBLIC or
              (:studentId is not null and (
                a.uploadedBy = :studentId or
                a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.MEMBERS or
                (:officer = true and a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.OFFICERS) or
                (a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.SELECTED and
                  :studentId member of a.selectedStudentIds))))
              or (a.studyGroupId is not null and a.visibility = com.coms.backend.domain.ArchiveFile.Visibility.GROUP
                and :studentId is not null and (:activityWriter = true or
                  exists (select g.id from StudyGroup g where g.id = a.studyGroupId and g.leaderStudentId = :studentId) or
                  exists (select m.id from StudyGroupMember m where m.groupId = a.studyGroupId
                    and m.studentId = :studentId and m.status = com.coms.backend.domain.StudyGroupMember.Status.APPROVED)))
            order by a.uploadedAt desc
            """)
    List<ArchiveFile> findVisible(@Param("studentId") String studentId, @Param("officer") boolean officer,
                                  @Param("admin") boolean admin, @Param("activityWriter") boolean activityWriter,
                                  Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ArchiveFile a where a.id = :id")
    Optional<ArchiveFile> findByIdForUpdate(@Param("id") Long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE ArchiveFile a SET a.viewCount = a.viewCount + 1 WHERE a.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
