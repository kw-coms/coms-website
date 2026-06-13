package com.coms.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmailVerificationSender {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationSender.class);

    private final JavaMailSender mailSender;
    private final boolean mailEnabled;
    private final boolean logVerificationCodes;
    private final String from;

    public EmailVerificationSender(JavaMailSender mailSender,
                                   @Value("${mail.enabled:false}") boolean mailEnabled,
                                   @Value("${mail.log-verification-codes:false}") boolean logVerificationCodes,
                                   @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from) {
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.logVerificationCodes = logVerificationCodes;
        this.from = from;
    }

    public void sendVerificationCode(String to, String code) {
        sendCode(
                to,
                code,
                "COM's 이메일 인증코드",
                "COM's 이메일 인증코드: " + code + "\n\n10분 안에 입력해주세요.",
                "Email verification code"
        );
    }

    public void sendPasswordResetCode(String to, String code) {
        sendCode(
                to,
                code,
                "COM's 비밀번호 재설정 인증코드",
                "COM's 비밀번호 재설정 인증코드: " + code + "\n\n10분 안에 입력해주세요.",
                "Password reset code"
        );
    }

    public void sendExternalInvite(String to, String subject, String text) {
        if (!mailEnabled) {
            log.info("External invite mail skipped for {} (mail disabled)", to);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
        } catch (RuntimeException e) {
            log.warn("Failed to send external invite mail to {}", to, e);
        }
    }

    private void sendCode(String to, String code, String subject, String text, String logLabel) {
        if (!mailEnabled) {
            if (logVerificationCodes) {
                log.info("{} for {} is {}. Set MAIL_ENABLED=true with SMTP_* env vars to send mail.", logLabel, to, code);
                return;
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송 설정이 아직 완료되지 않았습니다.");
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
        } catch (RuntimeException e) {
            log.warn("Failed to send {} to {}", logLabel, to, e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송에 실패했습니다.");
        }
    }
}
