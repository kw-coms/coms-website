package com.coms.backend.repository;

import com.coms.backend.domain.MeetingPoll;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MeetingPollRepository extends JpaRepository<MeetingPoll, Long> {
    List<MeetingPoll> findAllByOrderByCreatedAtDescIdDesc();

    List<MeetingPoll> findByCreatorStudentId(String creatorStudentId);

    long countByCreatorStudentId(String creatorStudentId);
}
