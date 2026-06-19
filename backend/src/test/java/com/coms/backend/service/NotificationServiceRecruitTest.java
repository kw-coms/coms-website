package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.domain.Notification;
import com.coms.backend.domain.RecruitApplication;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:notification-recruit-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false",
        "integration.hmac-secret=unit-test-secret-1234567890-abcdef",
        "notification.external-invite.allowed-hosts=example.test"
})
class NotificationServiceRecruitTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private MemberRepository memberRepository;

    private Member adminOne;
    private Member adminTwo;
    private Member normalUser;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
        adminOne = saveMember("2026900001", "관리자1", Member.Role.ADMIN);
        adminTwo = saveMember("2026900002", "관리자2", Member.Role.ADMIN);
        normalUser = saveMember("2026900003", "일반회원", Member.Role.USER);
    }

    @Test
    void notifyRecruitApplicationAlertsEveryAdminButNotRegularMembers() {
        RecruitApplication application = new RecruitApplication();
        application.setName("홍길동");
        application.setStudentId("2026123456");

        notificationService.notifyRecruitApplication(application);

        List<Notification> adminOneNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(adminOne.getStudentId());
        List<Notification> adminTwoNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(adminTwo.getStudentId());
        List<Notification> userNotifs =
                notificationRepository.findTop30ByRecipientStudentIdOrderByCreatedAtDesc(normalUser.getStudentId());

        assertThat(adminOneNotifs).hasSize(1);
        assertThat(adminOneNotifs.get(0).getType()).isEqualTo(Notification.Type.RECRUIT_APPLICATION);
        assertThat(adminOneNotifs.get(0).getMessage()).contains("홍길동").contains("2026123456");
        assertThat(adminTwoNotifs).hasSize(1);
        assertThat(adminTwoNotifs.get(0).getType()).isEqualTo(Notification.Type.RECRUIT_APPLICATION);
        assertThat(userNotifs).isEmpty();
    }

    private Member saveMember(String studentId, String name, Member.Role role) {
        return memberRepository.findByStudentId(studentId).orElseGet(() -> {
            Member fresh = new Member();
            fresh.setStudentId(studentId);
            fresh.setName(name);
            fresh.setEmail("recruit-" + System.nanoTime() + "@example.com");
            fresh.setPassword("hashed-password");
            fresh.setRole(role);
            return memberRepository.save(fresh);
        });
    }
}
