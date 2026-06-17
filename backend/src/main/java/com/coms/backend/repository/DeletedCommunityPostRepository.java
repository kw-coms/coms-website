package com.coms.backend.repository;

import com.coms.backend.domain.DeletedCommunityPost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DeletedCommunityPostRepository extends JpaRepository<DeletedCommunityPost, Long> {
    List<DeletedCommunityPost> findAllByOrderByDeletedAtDesc(Pageable pageable);
}
