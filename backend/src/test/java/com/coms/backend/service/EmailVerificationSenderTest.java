package com.coms.backend.service;

import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.web.server.ResponseStatusException;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailVerificationSenderTest {

    /**
     * MimeMessageHelper's MIXED_RELATED mode (triggered by the 3-arg constructor's
     * {@code true}) nests multipart/mixed > multipart/related > multipart/alternative even with
     * no attachments or inline images; walk down to the alternative (plain + html) part.
     */
    private static jakarta.mail.Multipart findAlternative(jakarta.mail.Multipart multipart) throws Exception {
        if (multipart.getCount() == 2) {
            return multipart;
        }
        if (multipart.getCount() == 1 && multipart.getBodyPart(0).getContent() instanceof jakarta.mail.Multipart nested) {
            return findAlternative(nested);
        }
        throw new IllegalStateException("Could not find the plain/html alternative part in " + multipart.getContentType());
    }

    @Test
    void sendVerificationCodeSendsMultipartMailWithDisplayNameFromAndReplyTo() throws Exception {
        // MimeMessageHelper manipulates a real jakarta.mail MimeMessage, not a mock, so hand back
        // one built by a real JavaMailSenderImpl.
        JavaMailSenderImpl realSender = new JavaMailSenderImpl();
        realSender.setJavaMailProperties(new Properties());
        MimeMessage mimeMessage = realSender.createMimeMessage();

        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        EmailVerificationSender sender = new EmailVerificationSender(
                mailSender,
                true,
                false,
                "no-reply@coms.kw.ac.kr",
                "smtp.gmail.com",
                587,
                "kwcoms69@gmail.com",
                "https://coms.kw.ac.kr"
        );

        sender.sendVerificationCode("member@example.com", "123456");

        verify(mailSender).send(any(MimeMessage.class));
        assertThat(mimeMessage.getFrom()).hasSize(1);
        assertThat(mimeMessage.getFrom()[0].toString()).contains("KW COM's").contains("no-reply@coms.kw.ac.kr");
        assertThat(mimeMessage.getReplyTo()).hasSize(1);
        assertThat(mimeMessage.getReplyTo()[0].toString()).contains("no-reply@coms.kw.ac.kr");
        assertThat(mimeMessage.getSubject()).isEqualTo("[KW COM's] 이메일 인증코드");

        // getContentType() only reflects the Content-Type header, which JavaMail only writes on
        // saveChanges() (normally triggered by a real send); the mocked send() here never calls
        // it, so assert on the actual multipart body instead.
        Object content = mimeMessage.getContent();
        assertThat(content).isInstanceOf(jakarta.mail.Multipart.class);
        jakarta.mail.Multipart multipart = findAlternative((jakarta.mail.Multipart) content);
        assertThat(multipart.getCount()).isEqualTo(2);
        String plainPart = (String) multipart.getBodyPart(0).getContent();
        String htmlPart = (String) multipart.getBodyPart(1).getContent();
        assertThat(plainPart).contains("123456").contains("10분 안에 입력해주세요");
        assertThat(htmlPart).contains("123456").contains("coms.kw.ac.kr");
        assertThat(htmlPart).doesNotContain("<img");
    }

    @Test
    void sendPasswordResetCodeUsesResetSubjectLabel() throws Exception {
        JavaMailSenderImpl realSender = new JavaMailSenderImpl();
        realSender.setJavaMailProperties(new Properties());
        MimeMessage mimeMessage = realSender.createMimeMessage();

        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        EmailVerificationSender sender = new EmailVerificationSender(
                mailSender,
                true,
                false,
                "no-reply@coms.kw.ac.kr",
                "smtp.gmail.com",
                587,
                "kwcoms69@gmail.com",
                "https://coms.kw.ac.kr"
        );

        sender.sendPasswordResetCode("member@example.com", "654321");

        assertThat(mimeMessage.getSubject()).isEqualTo("[KW COM's] 비밀번호 재설정 인증코드");
    }

    @Test
    void sendVerificationCodeWithMailDisabledAndLoggingOffThrowsServiceUnavailable() {
        EmailVerificationSender sender = new EmailVerificationSender(
                mock(JavaMailSender.class),
                false,
                false,
                "no-reply@coms.kw.ac.kr",
                "localhost",
                587,
                "",
                "https://coms.kw.ac.kr"
        );

        assertThatThrownBy(() -> sender.sendVerificationCode("member@example.com", "123456"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
