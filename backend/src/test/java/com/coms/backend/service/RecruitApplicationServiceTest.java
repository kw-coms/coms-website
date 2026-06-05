package com.coms.backend.service;

import com.coms.backend.dto.RecruitApplicationRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class RecruitApplicationServiceTest {

    @Test
    void submitSendsClubMailAndApplicantConfirmation() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mailSender,
                true,
                "no-reply@coms.kw.ac.kr",
                "kwcoms69@gmail.com"
        );

        service.submit(request());

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(2)).send(captor.capture());
        List<SimpleMailMessage> messages = captor.getAllValues();

        SimpleMailMessage clubMessage = messages.get(0);
        assertThat(clubMessage.getTo()).containsExactly("kwcoms69@gmail.com");
        assertThat(clubMessage.getReplyTo()).isEqualTo("applicant@example.com");
        assertThat(clubMessage.getSubject()).isEqualTo("[COM's 지원] 홍길동");
        assertThat(clubMessage.getText()).contains("학번: 2026123456", "[지원 동기]", "열심히 배우고 싶습니다.");

        SimpleMailMessage applicantMessage = messages.get(1);
        assertThat(applicantMessage.getTo()).containsExactly("applicant@example.com");
        assertThat(applicantMessage.getSubject()).isEqualTo("[COM's] 지원서가 접수되었습니다");
        assertThat(applicantMessage.getText()).contains("COM's 지원서가 정상적으로 접수되었습니다.");
    }

    @Test
    void submitRejectsWhenMailIsDisabled() {
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                false,
                "no-reply@coms.kw.ac.kr",
                "kwcoms69@gmail.com"
        );

        assertThatThrownBy(() -> service.submit(request()))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    private RecruitApplicationRequest request() {
        return new RecruitApplicationRequest(
                "홍길동",
                "2026123456",
                "컴퓨터정보공학부",
                "1학년",
                "01012345678",
                "applicant@example.com",
                "웹",
                "열심히 배우고 싶습니다.",
                "HTML을 공부했습니다.",
                "프로젝트를 해보고 싶습니다."
        );
    }
}
