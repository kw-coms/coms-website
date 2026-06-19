package com.coms.backend.repository;

import com.coms.backend.domain.NoticeVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface NoticeVoteRepository extends JpaRepository<NoticeVote, Long> {
    List<NoticeVote> findByNoticeIdIn(Collection<Long> noticeIds);
    Optional<NoticeVote> findByNoticeIdAndStudentId(Long noticeId, String studentId);
    void deleteByStudentId(String studentId);
}
