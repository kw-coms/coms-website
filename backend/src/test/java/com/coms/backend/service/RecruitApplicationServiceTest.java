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
import static org.mockito.Mockito.verify;

class RecruitApplicationServiceTest {

    @Test
    void sendApplicationSendsMailToRecruitRecipient() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        RecruitApplicationService service = new RecruitApplicationService(
                mailSender,
                true,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        service.sendApplication(sampleRequest(), "127.0.0.1");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(captor.capture());

        SimpleMailMessage message = captor.getValue();
        assertThat(message.getFrom()).isEqualTo("no-reply@coms.kw.ac.kr");
        assertThat(message.getTo()).containsExactly("recruit@coms.kw.ac.kr");
        assertThat(message.getReplyTo()).isEqualTo("applicant@example.com");
        assertThat(message.getSubject()).isEqualTo("[COM's 지원] 홍길동");
        assertThat(message.getText())
                .contains("학번: 2026123456")
                .contains("관심 분야: 웹, 기타: AI")
                .contains("[지원 동기]\n함께 만들고 싶습니다.");
    }

    @Test
    void sendApplicationFailsWhenMailIsDisabled() {
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
                false,
                "no-reply@coms.kw.ac.kr",
                "recruit@coms.kw.ac.kr"
        );

        assertThatThrownBy(() -> service.sendApplication(sampleRequest(), "127.0.0.1"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void sendApplicationRateLimitsRepeatedSubmissionsFromSameClient() {
        RecruitApplicationService service = new RecruitApplicationService(
                mock(JavaMailSender.class),
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
