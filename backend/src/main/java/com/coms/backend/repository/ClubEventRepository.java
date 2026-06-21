package com.coms.backend.repository;

import com.coms.backend.domain.ClubEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ClubEventRepository extends JpaRepository<ClubEvent, Long> {
    List<ClubEvent> findAllByOrderByCreatedAtDesc();
}
