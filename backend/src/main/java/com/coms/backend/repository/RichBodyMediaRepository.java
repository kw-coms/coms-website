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
    List<RichBodyMedia> findByOwnerIdIsNullAndCreatedAtBefore(LocalDateTime cutoff);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from RichBodyMedia m where m.id = :id")
    Optional<RichBodyMedia> findLockedById(@org.springframework.data.repository.query.Param("id") Long id);
}
