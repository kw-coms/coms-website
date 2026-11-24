package com.coms.backend.repository;

import com.coms.backend.domain.StudyGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface StudyGroupMemberRepository extends JpaRepository<StudyGroupMember, Long> {
    Optional<StudyGroupMember> findByGroupIdAndStudentId(Long groupId, String studentId);
    List<StudyGroupMember> findByGroupIdOrderByJoinedAtAscIdAsc(Long groupId);
    List<StudyGroupMember> findByGroupIdAndStatus(Long groupId, StudyGroupMember.Status status);
    long countByGroupIdAndStatus(Long groupId, StudyGroupMember.Status status);
    void deleteByGroupIdAndStudentId(Long groupId, String studentId);
    void deleteByStudentId(String studentId);
}
