package com.coms.backend.service;

import jakarta.annotation.PostConstruct;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmailVerificationSender {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationSender.class);
    private static final String SENDER_DISPLAY_NAME = "KW COM's";

    private final JavaMailSender mailSender;
    private final boolean mailEnabled;
    private final boolean logVerificationCodes;
    private final String from;
    private final String smtpHost;
    private final int smtpPort;
    private final String smtpUsername;
    private final String siteUrl;

    public EmailVerificationSender(JavaMailSender mailSender,
                                   @Value("${mail.enabled:false}") boolean mailEnabled,
                                   @Value("${mail.log-verification-codes:false}") boolean logVerificationCodes,
                                   @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from,
                                   @Value("${spring.mail.host:localhost}") String smtpHost,
                                   @Value("${spring.mail.port:587}") int smtpPort,
                                   @Value("${spring.mail.username:}") String smtpUsername,
                                   @Value("${site.url:https://coms.kw.ac.kr}") String siteUrl) {
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.logVerificationCodes = logVerificationCodes;
        this.from = from;
        this.smtpHost = smtpHost;
        this.smtpPort = smtpPort;
        this.smtpUsername = smtpUsername;
        this.siteUrl = siteUrl;
    }

    /**
     * Logs the effective SMTP wiring once at startup so a misconfigured deploy (wrong host,
     * blank username, mail left disabled) is visible in the logs instead of only surfacing as
     * silent "verification email never arrived" reports.
     */
    @PostConstruct
    void logMailConfiguration() {
        if (mailEnabled) {
            log.info("Mail enabled via {}:{} as {}", smtpHost, smtpPort, mask(smtpUsername));
        } else {
            log.info("Mail disabled (MAIL_ENABLED=false); verification codes will {}.",
                    logVerificationCodes ? "be logged instead of sent" : "fail with 503 until mail is enabled");
        }
    }

    public void sendVerificationCode(String to, String code) {
        sendCode(
                to,
                code,
                "이메일 인증코드",
                "COM's 이메일 인증코드: " + code + "\n\n10분 안에 입력해주세요.",
                "Email verification code"
        );
    }

    public void sendPasswordResetCode(String to, String code) {
        sendCode(
                to,
                code,
                "비밀번호 재설정 인증코드",
                "COM's 비밀번호 재설정 인증코드: " + code + "\n\n10분 안에 입력해주세요.",
                "Password reset code"
        );
    }

    public void sendExternalInvite(String to, String subject, String text) {
        if (!mailEnabled) {
            log.info("External invite mail skipped for {} (mail disabled)", mask(to));
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
            log.info("External invite mail sent to {}", mask(to));
        } catch (RuntimeException e) {
            log.warn("Failed to send external invite mail to {}", mask(to), e);
        }
    }

    private void sendCode(String to, String code, String subjectLabel, String plainText, String logLabel) {
        if (!mailEnabled) {
            if (logVerificationCodes) {
                log.info("{} for {} is {}. Set MAIL_ENABLED=true with SMTP_* env vars to send mail.", logLabel, to, code);
                return;
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송 설정이 아직 완료되지 않았습니다.");
        }

        // Gmail (and most inbox providers) route a plain-text-only, no-display-name From into
        // spam/promotions far more often than a proper multipart message with a real sender name
        // and a Reply-To — this was the likely cause of "code never arrived" reports that weren't
        // send failures at all.
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(new InternetAddress(from, SENDER_DISPLAY_NAME, "UTF-8"));
            helper.setReplyTo(from);
            helper.setTo(to);
            // The code stays out of the subject: subjects show on lock screens and inbox previews.
            helper.setSubject("[" + SENDER_DISPLAY_NAME + "] " + subjectLabel);
            helper.setText(plainText, buildHtml(subjectLabel, code));
            mailSender.send(message);
            // Success used to be silent, which made "mail isn't arriving" reports
            // undiagnosable from logs alone (had to correlate against DB code hashes).
            log.info("{} sent to {}", logLabel, mask(to));
        } catch (Exception e) {
            log.warn("Failed to send {} to {}", logLabel, mask(to), e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송에 실패했습니다.");
        }
    }

    /** Minimal HTML alternative: no images, no links other than the site root. */
    private String buildHtml(String subjectLabel, String code) {
        return "<div style=\"font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;"
                + "margin:0 auto;padding:24px;color:#1d1d1f;\">"
                + "<p style=\"font-size:15px;line-height:1.6;margin:0 0 12px;\">COM's " + subjectLabel + ": "
                + "<strong style=\"font-size:22px;letter-spacing:2px;\">" + code + "</strong></p>"
                + "<p style=\"font-size:13px;color:#6e6e73;margin:0 0 24px;\">10분 안에 입력해주세요.</p>"
                + "<p style=\"font-size:12px;color:#a1a1a6;margin:0;\">"
                + "<a href=\"" + siteUrl + "\" style=\"color:#0071e3;text-decoration:none;\">" + siteUrl + "</a></p>"
                + "</div>";
    }

    /** Masks the local part so delivery logs don't hold full addresses (e.g. cho***@gmail.com). */
    private static String mask(String email) {
        if (email == null || email.isBlank()) {
            return "unknown";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.substring(0, Math.min(3, at)) + "***" + email.substring(at);
    }
}
