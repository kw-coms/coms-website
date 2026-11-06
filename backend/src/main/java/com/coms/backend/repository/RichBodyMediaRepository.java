package com.coms.backend.repository;

import com.coms.backend.domain.RichBodyMedia;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RichBodyMediaRepository extends JpaRepository<RichBodyMedia, Long> {
    List<RichBodyMedia> findByScopeAndOwnerId(RichBodyMedia.Scope scope, Long ownerId);
    @org.springframework.data.jpa.repository.Query("""
            select m from RichBodyMedia m where m.ownerId is null and (
                (m.detachedAt is null and m.attachedAt is null and m.createdAt < :pendingCutoff)
                or m.detachedAt < :detachedCutoff)
            """)
    List<RichBodyMedia> findOrphansOlderThan(
            @org.springframework.data.repository.query.Param("pendingCutoff") LocalDateTime pendingCutoff,
            @org.springframework.data.repository.query.Param("detachedCutoff") LocalDateTime detachedCutoff);
    /** Per-member quota counts only never-attached or re-attachable rows, not ones detached by an edit. */
    @org.springframework.data.jpa.repository.Query("select count(m) from RichBodyMedia m where m.uploaderId = :uploaderId and m.ownerId is null and m.detachedAt is null")
    long countPending(@org.springframework.data.repository.query.Param("uploaderId") Long uploaderId);
    @org.springframework.data.jpa.repository.Query("select coalesce(sum(m.sizeBytes), 0) from RichBodyMedia m where m.uploaderId = :uploaderId and m.ownerId is null and m.detachedAt is null")
    long sumPendingBytes(@org.springframework.data.repository.query.Param("uploaderId") Long uploaderId);
    /** Site-wide pending + detached bytes (everything not yet attached to an owner). */
    @org.springframework.data.jpa.repository.Query("select coalesce(sum(m.sizeBytes), 0) from RichBodyMedia m where m.ownerId is null")
    long sumAllPendingBytes();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from RichBodyMedia m where m.id = :id")
    Optional<RichBodyMedia> findLockedById(@org.springframework.data.repository.query.Param("id") Long id);
}
