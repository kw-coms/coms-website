package com.coms.backend.repository;

import com.coms.backend.domain.ClubActivity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ClubActivityRepository extends JpaRepository<ClubActivity, Long> {
    List<ClubActivity> findAllByOrderByEventDateDescCreatedAtDesc();
}
