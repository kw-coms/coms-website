package com.coms.backend.repository;

import com.coms.backend.domain.Notice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NoticeRepository extends JpaRepository<Notice, Long> {
    List<Notice> findAllByOrderByPinnedDescCreatedAtDesc();
}
