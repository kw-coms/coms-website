package com.coms.backend.service;

import com.coms.backend.dto.RecruitApplicationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RecruitApplicationService {

    private static final Logger log = LoggerFactory.getLogger(RecruitApplicationService.class);

    private final JavaMailSender mailSender;
    private final boolean mailEnabled;
    private final String from;
    private final String recruitTo;

    public RecruitApplicationService(JavaMailSender mailSender,
                                     @Value("${mail.enabled:false}") boolean mailEnabled,
                                     @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from,
                                     @Value("${mail.recruit-to:kwcoms69@gmail.com}") String recruitTo) {
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.from = from;
        this.recruitTo = recruitTo;
    }

    public void submit(RecruitApplicationRequest request) {
        if (!mailEnabled) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "이메일 발송 설정이 아직 완료되지 않았습니다.");
        }

        try {
            mailSender.send(buildClubMessage(request));
            mailSender.send(buildApplicantMessage(request));
        } catch (RuntimeException e) {
            log.warn("Failed to send recruit application mail for {}", request.email(), e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "지원서 메일 발송에 실패했습니다.");
        }
    }

    private SimpleMailMessage buildClubMessage(RecruitApplicationRequest request) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setReplyTo(request.email().trim());
        message.setTo(recruitTo);
        message.setSubject("[COM's 지원] " + request.name().trim());
        message.setText("""
                [COM's 지원서]

                이름: %s
                학번: %s
                학과: %s
                학년: %s
                전화번호: %s
                이메일: %s
                관심 분야: %s

                [지원 동기]
                %s

                [관련 경험]
                %s

                [기대하는 활동]
                %s
                """.formatted(
                request.name().trim(),
                request.studentId().trim(),
                request.department().trim(),
                request.grade().trim(),
                request.phone().trim(),
                request.email().trim(),
                request.interests().trim(),
                request.motivation().trim(),
                request.experience().trim(),
                request.expectedActivities().trim()
        ));
        return message;
    }

    private SimpleMailMessage buildApplicantMessage(RecruitApplicationRequest request) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(request.email().trim());
        message.setSubject("[COM's] 지원서가 접수되었습니다");
        message.setText("""
                안녕하세요, %s님.

                COM's 지원서가 정상적으로 접수되었습니다.
                내부 확인 후 입력하신 연락처 또는 이메일로 개별 연락드리겠습니다.

                [접수 내용 요약]
                이름: %s
                학번: %s
                학과: %s
                학년: %s
                관심 분야: %s

                지원해주셔서 감사합니다.
                COM's
                """.formatted(
                request.name().trim(),
                request.name().trim(),
                request.studentId().trim(),
                request.department().trim(),
                request.grade().trim(),
                request.interests().trim()
        ));
        return message;
    }
}
