package com.coms.backend.repository;

import com.coms.backend.domain.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findTop30ByRecipientStudentIdOrderByCreatedAtDesc(String recipientStudentId);
    List<Notification> findByRecipientStudentIdAndReadAtIsNull(String recipientStudentId);
    long countByRecipientStudentIdAndReadAtIsNull(String recipientStudentId);
    long countByActorStudentIdAndTypeAndCreatedAtAfter(String actorStudentId, Notification.Type type, LocalDateTime threshold);
}
