package com.coms.backend.service;

import com.coms.backend.domain.RecruitApplication;
import com.coms.backend.dto.RecruitApplicationStatusUpdateRequest;
import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.repository.RecruitApplicationRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecruitApplicationServiceTest {

    @Test
    void sendApplicationSendsMailToRecruitRecipient() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RecruitApplicationService service = new RecruitApplicationService(
                mailSender,
                repository,
                mock(NotificationService.class),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.sendApplication(sampleRequest(), "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(2)).send(captor.capture());

        SimpleMailMessage message = captor.getAllValues().get(0);
        assertThat(message.getFrom()).isEqualTo("no-reply@coms.kw.ac.kr");
        assertThat(message.getTo()).containsExactly("recruit@coms.kw.ac.kr");
        assertThat(message.getReplyTo()).isEqualTo("applicant@example.com");
        assertThat(message.getSubject()).isEqualTo("[COM's 지원] 홍길동");
        assertThat(message.getText())
                .contains("학번: 2026123456")
                .contains("관심 분야: 웹, 기타: AI")
                .contains("[지원 동기]\n함께 만들고 싶습니다.");

        SimpleMailMessage confirmation = captor.getAllValues().get(1);
        assertThat(confirmation.getFrom()).isEqualTo("no-reply@coms.kw.ac.kr");
        assertThat(confirmation.getTo()).containsExactly("applicant@example.com");
        assertThat(confirmation.getSubject()).isEqualTo("[COM's] 지원서가 접수되었습니다");
        assertThat(confirmation.getText())
                .contains("COM's 지원서가 정상적으로 접수되었습니다.")
                .contains("학번: 2026123456")
                .contains("관심 분야: 웹, 기타: AI");
    }

    @Test
    void sendApplicationPersistsAndNotifiesAdminsEvenWhenMailDisabled() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        NotificationService notificationService = mock(NotificationService.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mailSender,
                repository,
                notificationService,
                false,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        // Mail disabled must NOT lose the application: it is still saved and admins are
        // alerted in-app. No email is attempted, and no exception is thrown.
        service.sendApplication(sampleRequest(), "127.0.0.1");

        verify(repository).save(any(RecruitApplication.class));
        verify(notificationService).notifyRecruitApplication(any(RecruitApplication.class));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void sendApplicationRateLimitsRepeatedSubmissionsFromSameClient() {
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        for (int i = 0; i < 5; i++) {
            service.sendApplication(sampleRequest(), "127.0.0.1");
        }

        assertThatThrownBy(() -> service.sendApplication(sampleRequest(), "127.0.0.1"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void sendApplicationPersistsReceivedApplicationForAdminReview() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        NotificationService notificationService = mock(NotificationService.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mailSender,
                repository,
                notificationService,
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.sendApplication(sampleRequest(), "203.0.113.9");

        ArgumentCaptor<RecruitApplication> captor = ArgumentCaptor.forClass(RecruitApplication.class);
        verify(repository).save(captor.capture());
        RecruitApplication saved = captor.getValue();
        assertThat(saved.getName()).isEqualTo("홍길동");
        assertThat(saved.getStudentId()).isEqualTo("2026123456");
        assertThat(saved.getStatus()).isEqualTo(RecruitApplication.Status.RECEIVED);
        assertThat(saved.getClientIp()).isEqualTo("203.0.113.9");
        assertThat(saved.getInterests()).isEqualTo("웹, 기타: AI");

        // Admins are alerted in-app for every received application.
        verify(notificationService).notifyRecruitApplication(any(RecruitApplication.class));
    }

    @Test
    void updateApplicationStatusPersistsAdminStatusAndNote() {
        RecruitApplication application = new RecruitApplication();
        application.setStatus(RecruitApplication.Status.RECEIVED);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        var response = service.updateStatus(
                1L,
                new RecruitApplicationStatusUpdateRequest("ACCEPTED", "OT 안내 완료")
        );

        assertThat(application.getStatus()).isEqualTo(RecruitApplication.Status.ACCEPTED);
        assertThat(application.getAdminNote()).isEqualTo("OT 안내 완료");
        assertThat(response.status()).isEqualTo("ACCEPTED");
        assertThat(response.adminNote()).isEqualTo("OT 안내 완료");
    }

    @Test
    void updateApplicationStatusRejectsUnknownStatus() {
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(new RecruitApplication()));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        assertThatThrownBy(() -> service.updateStatus(
                1L,
                new RecruitApplicationStatusUpdateRequest("MAYBE", "애매함")
        ))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private static RecruitApplicationRequest sampleRequest() {
        return new RecruitApplicationRequest(
                "홍길동",
                "2026123456",
                "컴퓨터공학과",
                "1학년",
                "01012345678",
                "applicant@example.com",
                List.of("웹", "기타: AI"),
                "함께 만들고 싶습니다.",
                "",
                "프로젝트와 스터디를 해보고 싶습니다."
        );
    }
}
