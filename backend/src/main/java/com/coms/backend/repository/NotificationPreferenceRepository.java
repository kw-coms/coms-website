package com.coms.backend.repository;

import com.coms.backend.domain.NotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, Long> {
    Optional<NotificationPreference> findByMemberStudentId(String memberStudentId);
    List<NotificationPreference> findByMemberStudentIdIn(Collection<String> memberStudentIds);
    void deleteByMemberStudentId(String memberStudentId);
}
