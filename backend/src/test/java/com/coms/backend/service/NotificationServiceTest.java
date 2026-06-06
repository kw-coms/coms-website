package com.coms.backend.service;

import com.coms.backend.domain.Notification;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notification-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false"
})
class NotificationServiceTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
    }

    @Test
    void clearReadDeletesOnlyReadNotificationsForCurrentStudent() {
        Notification unreadForCurrentStudent = saveNotification("2026000001", false);
        saveNotification("2026000001", true);
        Notification readForAnotherStudent = saveNotification("2026000002", true);

        notificationService.clearRead("2026000001");

        assertThat(notificationRepository.findAll())
                .extracting(Notification::getId)
                .containsExactlyInAnyOrder(unreadForCurrentStudent.getId(), readForAnotherStudent.getId());
    }

    private Notification saveNotification(String recipientStudentId, boolean read) {
        Notification notification = new Notification();
        notification.setRecipientStudentId(recipientStudentId);
        notification.setType(Notification.Type.COMMENT_ON_POST);
        notification.setMessage("Notification test message");
        if (read) {
            notification.markRead();
        }
        return notificationRepository.save(notification);
    }
}
