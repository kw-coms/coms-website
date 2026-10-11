package com.coms.backend.service;

import com.coms.backend.domain.RecruitApplication;
import com.coms.backend.dto.RecruitApplicationStatusLookupRequest;
import com.coms.backend.dto.RecruitApplicationStatusResponse;
import com.coms.backend.dto.RecruitApplicationStatusUpdateRequest;
import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.repository.RecruitApplicationRepository;
import com.coms.backend.repository.RecruitPromotionLogRepository;
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
import static org.mockito.Mockito.doThrow;
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
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
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
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
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
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
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
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
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
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        var response = service.updateStatus(
                1L,
                new RecruitApplicationStatusUpdateRequest("ACCEPTED", "OT 안내 완료"), "admin"
        );

        assertThat(application.getStatus()).isEqualTo(RecruitApplication.Status.ACCEPTED);
        assertThat(application.getAdminNote()).isEqualTo("OT 안내 완료");
        assertThat(response.status()).isEqualTo("ACCEPTED");
        assertThat(response.adminNote()).isEqualTo("OT 안내 완료");
    }

    @Test
    void acceptedStatusPromotesToRosterLogsAndDeletesApplication() {
        RecruitApplication application = new RecruitApplication();
        application.setName("가상지원자");
        application.setStudentId("2026990101");
        application.setPhone("01000000000");
        application.setDepartment("소프트웨어학부");
        application.setStatus(RecruitApplication.Status.REVIEWING);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        java.time.Clock fixed = java.time.Clock.fixed(java.time.Instant.parse("2026-09-02T00:00:00Z"), java.time.ZoneId.of("Asia/Seoul"));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                eligible,
                promotionLogs,
                fixed,
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.updateStatus(1L, new RecruitApplicationStatusUpdateRequest("ACCEPTED", null), "2026990901");

        // 2026 - 1966 = 60기 as the joining cohort, regardless of the studentId year.
        // 합격 이관 행은 준회원(ASSOCIATE)으로 표시되어, 이 학번으로 가입하면 준회원 계정이 만들어진다.
        verify(eligible).addSingle("2026990101", "가상지원자", "60", "01000000000",
                com.coms.backend.domain.Member.Role.ASSOCIATE);
        ArgumentCaptor<com.coms.backend.domain.RecruitPromotionLog> logCaptor =
                ArgumentCaptor.forClass(com.coms.backend.domain.RecruitPromotionLog.class);
        verify(promotionLogs).save(logCaptor.capture());
        assertThat(logCaptor.getValue().getName()).isEqualTo("가상지원자");
        assertThat(logCaptor.getValue().getGeneration()).isEqualTo("60");
        assertThat(logCaptor.getValue().getPromotedBy()).isEqualTo("2026990901");
        verify(repository).delete(application);
    }

    @Test
    void rejectedStatusDeletesApplicationAndLogsDecisionWithoutContactDetails() {
        RecruitApplication application = new RecruitApplication();
        application.setName("김탈락");
        application.setStudentId("2026990102");
        application.setDepartment("컴퓨터공학과");
        application.setPhone("01099998888");
        application.setEmail("tallak@example.com");
        application.setStatus(RecruitApplication.Status.REVIEWING);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                eligible,
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.updateStatus(1L, new RecruitApplicationStatusUpdateRequest("REJECTED", "면접 불참"), "2026990901");

        // 명부에는 손대지 않는다 — 불합격은 이관 대상이 아니다.
        verify(eligible, never()).addSingle(any(), any(), any(), any(), any());

        ArgumentCaptor<com.coms.backend.domain.RecruitPromotionLog> logCaptor =
                ArgumentCaptor.forClass(com.coms.backend.domain.RecruitPromotionLog.class);
        verify(promotionLogs).save(logCaptor.capture());
        com.coms.backend.domain.RecruitPromotionLog saved = logCaptor.getValue();
        assertThat(saved.getName()).isEqualTo("김탈락");
        assertThat(saved.getStudentId()).isEqualTo("2026990102");
        assertThat(saved.getDepartment()).isEqualTo("컴퓨터공학과");
        assertThat(saved.getDecision()).isEqualTo(com.coms.backend.domain.RecruitPromotionLog.Decision.REJECTED);
        assertThat(saved.getAdminNote()).isEqualTo("면접 불참");
        assertThat(saved.getPromotedBy()).isEqualTo("2026990901");
        // 불합격자의 연락처는 남기지 않는다(개인정보 최소 보유 원칙).
        assertThat(saved.getPhone()).isNull();
        assertThat(saved.getEmail()).isNull();

        verify(repository).delete(application);
    }

    @Test
    void acceptedStatusLogsDecisionAcceptedAndAdminNote() {
        RecruitApplication application = new RecruitApplication();
        application.setName("가상지원자");
        application.setStudentId("2026990101");
        application.setPhone("01000000000");
        application.setDepartment("소프트웨어학부");
        application.setStatus(RecruitApplication.Status.REVIEWING);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                eligible,
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.updateStatus(1L, new RecruitApplicationStatusUpdateRequest("ACCEPTED", "OT 안내 완료"), "admin");

        ArgumentCaptor<com.coms.backend.domain.RecruitPromotionLog> logCaptor =
                ArgumentCaptor.forClass(com.coms.backend.domain.RecruitPromotionLog.class);
        verify(promotionLogs).save(logCaptor.capture());
        assertThat(logCaptor.getValue().getDecision()).isEqualTo(com.coms.backend.domain.RecruitPromotionLog.Decision.ACCEPTED);
        assertThat(logCaptor.getValue().getAdminNote()).isEqualTo("OT 안내 완료");
    }

    @Test
    void rejectingAlreadyDeletedApplicationReturnsNotFound() {
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.empty());
        RecruitApplicationService service = newService(repository);

        assertThatThrownBy(() -> service.updateStatus(
                1L, new RecruitApplicationStatusUpdateRequest("REJECTED", null), "admin"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void acceptedStatusAbortsWhenStudentIdBelongsToAnotherNameOnTheRoster() {
        RecruitApplication application = new RecruitApplication();
        application.setName("홍길동");
        application.setStudentId("2026990101");
        application.setStatus(RecruitApplication.Status.REVIEWING);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "이미 다른 이름으로 명부에 등록된 학번입니다."))
                .when(eligible).ensureStudentIdNotTakenByOtherName("2026990101", "홍길동");
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                eligible,
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        assertThatThrownBy(() -> service.updateStatus(
                1L, new RecruitApplicationStatusUpdateRequest("ACCEPTED", null), "admin"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        // 명부 덮어쓰기·이관 로그·지원서 삭제 모두 일어나지 않아야 한다(트랜잭션 롤백 대상).
        verify(eligible, never()).addSingle(any(), any(), any(), any(), any());
        verify(promotionLogs, never()).save(any());
        verify(repository, never()).delete(any(RecruitApplication.class));
    }

    @Test
    void nonAcceptedStatusDoesNotTouchRosterOrDeleteApplication() {
        RecruitApplication application = new RecruitApplication();
        application.setStatus(RecruitApplication.Status.RECEIVED);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(application));
        EligibleMemberService eligible = mock(EligibleMemberService.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                eligible,
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.updateStatus(1L, new RecruitApplicationStatusUpdateRequest("REVIEWING", null), "admin");

        verify(eligible, never()).addSingle(any(), any(), any(), any(), any());
        verify(promotionLogs, never()).save(any());
        verify(repository, never()).delete(any(RecruitApplication.class));
    }

    @Test
    void listPromotionsIncludesDecisionAndAdminNote() {
        com.coms.backend.domain.RecruitPromotionLog rejectedLog = new com.coms.backend.domain.RecruitPromotionLog();
        rejectedLog.setName("김탈락");
        rejectedLog.setDecision(com.coms.backend.domain.RecruitPromotionLog.Decision.REJECTED);
        rejectedLog.setAdminNote("면접 불참");
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        when(promotionLogs.findTop100ByOrderByPromotedAtDescIdDesc()).thenReturn(List.of(rejectedLog));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                mock(EligibleMemberService.class),
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        var responses = service.listPromotions();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).decision()).isEqualTo("REJECTED");
        assertThat(responses.get(0).adminNote()).isEqualTo("면접 불참");
    }

    @Test
    void updateApplicationStatusRejectsUnknownStatus() {
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.of(new RecruitApplication()));
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        assertThatThrownBy(() -> service.updateStatus(
                1L,
                new RecruitApplicationStatusUpdateRequest("MAYBE", "애매함"), "admin"
        ))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void lookupStatusReturnsFriendlyLabelForMatchingApplicant() {
        RecruitApplication application = new RecruitApplication();
        application.setStudentId("2026123456");
        application.setName("홍길동");
        application.setStatus(RecruitApplication.Status.REVIEWING);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc("2026123456", "홍길동"))
                .thenReturn(Optional.of(application));
        RecruitApplicationService service = newService(repository);

        RecruitApplicationStatusResponse response = service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("홍길동", "2026123456"), "203.0.113.10");

        assertThat(response.status()).isEqualTo("REVIEWING");
        assertThat(response.statusLabel()).isEqualTo("검토 중");
        assertThat(response.submittedAt()).isNotNull();
    }

    @Test
    void lookupStatusReturnsGenericNotFoundWhenNoMatch() {
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(any(), any()))
                .thenReturn(Optional.empty());
        RecruitApplicationService service = newService(repository);

        assertThatThrownBy(() -> service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("없는사람", "9999999999"), "203.0.113.11"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void lookupStatusRateLimitsRepeatedLookupsFromSameClient() {
        RecruitApplication application = new RecruitApplication();
        application.setStudentId("2026123456");
        application.setName("홍길동");
        application.setStatus(RecruitApplication.Status.RECEIVED);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(any(), any()))
                .thenReturn(Optional.of(application));
        RecruitApplicationService service = newService(repository);
        RecruitApplicationStatusLookupRequest lookup =
                new RecruitApplicationStatusLookupRequest("홍길동", "2026123456");

        for (int i = 0; i < 10; i++) {
            service.lookupStatus(lookup, "203.0.113.12");
        }

        assertThatThrownBy(() -> service.lookupStatus(lookup, "203.0.113.12"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    void lookupStatusReportsTheDecisionAfterTheApplicationRowIsGone() {
        // 합격/불합격 처리는 지원서를 지우고 처리 이력만 남긴다. 결과가 나온 지원자가 조회했을 때
        // "지원 내역을 찾을 수 없습니다"가 아니라 그 결과를 봐야 한다.
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(any(), any()))
                .thenReturn(Optional.empty());
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        when(promotionLogs.findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc("2026990102", "김탈락"))
                .thenReturn(Optional.of(decision("김탈락", "2026990102",
                        com.coms.backend.domain.RecruitPromotionLog.Decision.REJECTED)));
        when(promotionLogs.findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc("2026990101", "가상지원자"))
                .thenReturn(Optional.of(decision("가상지원자", "2026990101",
                        com.coms.backend.domain.RecruitPromotionLog.Decision.ACCEPTED)));
        RecruitApplicationService service = newService(mock(JavaMailSender.class), repository, promotionLogs, "recruit@coms.kw.ac.kr");

        RecruitApplicationStatusResponse rejected = service.lookupStatus(
                new RecruitApplicationStatusLookupRequest(" 김탈락 ", "2026990102"), "203.0.113.20");
        RecruitApplicationStatusResponse accepted = service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("가상지원자", "2026990101"), "203.0.113.20");

        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(rejected.statusLabel()).isEqualTo("불합격");
        // 지원서가 없으므로 접수 시각은 알 수 없다. 관리자 메모는 응답 형식에 아예 없다.
        assertThat(rejected.submittedAt()).isNull();
        assertThat(accepted.status()).isEqualTo("ACCEPTED");
        assertThat(accepted.statusLabel()).isEqualTo("합격");
    }

    @Test
    void lookupStatusStopsAnsweringFromTheDecisionLogAfterNinetyDays() {
        // The log is kept for good as a record. The public lookup must not turn it into a way
        // to ask about every applicant of every past season with a name and a 학번.
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(any(), any()))
                .thenReturn(Optional.empty());
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        var lastSeason = decision("김지난", "2025990103", com.coms.backend.domain.RecruitPromotionLog.Decision.REJECTED);
        lastSeason.setPromotedAt(java.time.LocalDateTime.now().minusDays(91));
        var recent = decision("김최근", "2026990104", com.coms.backend.domain.RecruitPromotionLog.Decision.ACCEPTED);
        recent.setPromotedAt(java.time.LocalDateTime.now().minusDays(89));
        when(promotionLogs.findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc("2025990103", "김지난"))
                .thenReturn(Optional.of(lastSeason));
        when(promotionLogs.findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc("2026990104", "김최근"))
                .thenReturn(Optional.of(recent));
        RecruitApplicationService service = newService(mock(JavaMailSender.class), repository, promotionLogs, "recruit@coms.kw.ac.kr");

        assertThatThrownBy(() -> service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("김지난", "2025990103"), "203.0.113.21"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThat(service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("김최근", "2026990104"), "203.0.113.21").status())
                .isEqualTo("ACCEPTED");
    }

    @Test
    void lookupStatusPrefersAPendingApplicationOverAnOlderDecision() {
        // 지난 모집에서 불합격했다가 다시 지원한 경우: 지금 진행 중인 지원서가 답이다.
        RecruitApplication reapplied = new RecruitApplication();
        reapplied.setStudentId("2026990102");
        reapplied.setName("김탈락");
        reapplied.setStatus(RecruitApplication.Status.RECEIVED);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc("2026990102", "김탈락"))
                .thenReturn(Optional.of(reapplied));
        RecruitPromotionLogRepository promotionLogs = mock(RecruitPromotionLogRepository.class);
        when(promotionLogs.findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc(any(), any()))
                .thenReturn(Optional.of(decision("김탈락", "2026990102",
                        com.coms.backend.domain.RecruitPromotionLog.Decision.REJECTED)));
        RecruitApplicationService service = newService(mock(JavaMailSender.class), repository, promotionLogs, "recruit@coms.kw.ac.kr");

        RecruitApplicationStatusResponse response = service.lookupStatus(
                new RecruitApplicationStatusLookupRequest("김탈락", "2026990102"), "203.0.113.21");

        assertThat(response.status()).isEqualTo("RECEIVED");
        verify(promotionLogs, never()).findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc(any(), any());
    }

    @Test
    void applicantIsStillConfirmedWhenNoStaffRecipientIsConfigured() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RecruitApplicationService service = newService(mailSender, repository, mock(RecruitPromotionLogRepository.class), "  ");

        service.sendApplication(sampleRequest(), "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(1)).send(captor.capture());
        assertThat(captor.getValue().getTo()).containsExactly("applicant@example.com");
        assertThat(captor.getValue().getSubject()).isEqualTo("[COM's] 지원서가 접수되었습니다");
    }

    @Test
    void applicantIsStillConfirmedWhenTheStaffMailFails() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        doThrow(new org.springframework.mail.MailSendException("staff mailbox rejected"))
                .doNothing()
                .when(mailSender).send(any(SimpleMailMessage.class));
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RecruitApplicationService service = newService(mailSender, repository, mock(RecruitPromotionLogRepository.class), "recruit@coms.kw.ac.kr");

        service.sendApplication(sampleRequest(), "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(2)).send(captor.capture());
        assertThat(captor.getAllValues().get(1).getTo()).containsExactly("applicant@example.com");
    }

    @Test
    void confirmationMailKeepsEachSubmittedValueOnItsOwnLine() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationRepository repository = mock(RecruitApplicationRepository.class);
        when(repository.save(any(RecruitApplication.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RecruitApplicationService service = newService(mailSender, repository, mock(RecruitPromotionLogRepository.class), "recruit@coms.kw.ac.kr");
        // The confirmation goes to whatever address was typed into the public form, so the
        // values it echoes must not be able to add lines that read like a notice from the club.
        RecruitApplicationRequest crafted = new RecruitApplicationRequest(
                "홍길동",
                "2026123456",
                "컴퓨터공학과\n\n[COM's 안내]\n회비를 아래 계좌로 보내주세요",
                "1학년",
                "01012345678",
                "applicant@example.com",
                List.of("웹\n[긴급] 확인 필요"),
                "함께 만들고 싶습니다.",
                "",
                "프로젝트와 스터디를 해보고 싶습니다."
        );

        service.sendApplication(crafted, "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(2)).send(captor.capture());
        String confirmation = captor.getAllValues().get(1).getText();
        assertThat(confirmation.lines())
                .contains("학과: 컴퓨터공학과 [COM's 안내] 회비를 아래 계좌로 보내주세요")
                .contains("관심 분야: 웹 [긴급] 확인 필요")
                .noneMatch(line -> line.startsWith("[COM's 안내]") || line.startsWith("[긴급]"));
    }

    private static com.coms.backend.domain.RecruitPromotionLog decision(
            String name, String studentId, com.coms.backend.domain.RecruitPromotionLog.Decision decision) {
        com.coms.backend.domain.RecruitPromotionLog log = new com.coms.backend.domain.RecruitPromotionLog();
        log.setName(name);
        log.setStudentId(studentId);
        log.setDecision(decision);
        log.setAdminNote("내부 메모");
        return log;
    }

    private static RecruitApplicationService newService(JavaMailSender mailSender,
                                                        RecruitApplicationRepository repository,
                                                        RecruitPromotionLogRepository promotionLogs,
                                                        String staffRecipient) {
        return new RecruitApplicationService(
                mailSender,
                repository,
                mock(NotificationService.class),
                mock(EligibleMemberService.class),
                promotionLogs,
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                staffRecipient
        );
    }

    private static RecruitApplicationService newService(RecruitApplicationRepository repository) {
        return new RecruitApplicationService(
                mock(JavaMailSender.class),
                repository,
                mock(NotificationService.class),
                mock(EligibleMemberService.class),
                mock(RecruitPromotionLogRepository.class),
                java.time.Clock.systemDefaultZone(),
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );
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
