package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPost;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DeletedCommunityPostRepository extends JpaRepository<DeletedCommunityPost, Long> {
    // Serializes restores of one snapshot. Two moderators restoring at the same moment both
    // passed the "already restored" check and created two posts sharing one set of stored files,
    // so deleting either post later removed the other's attachments.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from DeletedCommunityPost d where d.id = :id")
    Optional<DeletedCommunityPost> findByIdForUpdate(@Param("id") Long id);

    List<DeletedCommunityPost> findAllByOrderByDeletedAtDesc(Pageable pageable);
    List<DeletedCommunityPost> findByAuthorStudentIdOrderByDeletedAtDesc(String authorStudentId);
}
