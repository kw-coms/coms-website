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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RecruitApplicationService {

    private static final Logger log = LoggerFactory.getLogger(RecruitApplicationService.class);
    private static final int MAX_APPLICATIONS_PER_WINDOW = 5;
    private static final Duration RATE_LIMIT_WINDOW = Duration.ofMinutes(10);

    private final JavaMailSender mailSender;
    private final boolean mailEnabled;
    private final String from;
    private final String to;
    private final Map<String, Deque<LocalDateTime>> submissionAttemptsByClient = new ConcurrentHashMap<>();

    public RecruitApplicationService(JavaMailSender mailSender,
                                     @Value("${mail.enabled:false}") boolean mailEnabled,
                                     @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from,
                                     @Value("${recruit.mail.to:kwcoms69@gmail.com}") String to) {
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.from = from;
        this.to = to;
    }

    public void sendApplication(RecruitApplicationRequest request, String clientIp) {
        enforceRateLimit(clientIp);
        if (!mailEnabled) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "메일 발송 설정이 아직 완료되지 않았습니다.");
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setReplyTo(oneLine(request.email()));
            message.setSubject("[COM's 지원] " + oneLine(request.name()));
            message.setText(buildBody(request));
            mailSender.send(message);
        } catch (RuntimeException e) {
            log.warn("Failed to send recruit application for studentId={}", request.studentId(), e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "지원서 메일 발송에 실패했습니다.");
        }
    }

    private void enforceRateLimit(String clientIp) {
        String key = clientIp == null || clientIp.isBlank() ? "unknown" : clientIp;
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minus(RATE_LIMIT_WINDOW);
        Deque<LocalDateTime> attempts = submissionAttemptsByClient.computeIfAbsent(key, ignored -> new ArrayDeque<>());

        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= MAX_APPLICATIONS_PER_WINDOW) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "지원서 제출 요청이 많습니다. 잠시 후 다시 시도해주세요.");
            }
            attempts.addLast(now);
        }
    }

    private static String buildBody(RecruitApplicationRequest request) {
        return String.join("\n",
                "[COM's 지원서]",
                "",
                "이름: " + trim(request.name()),
                "학번: " + trim(request.studentId()),
                "학과: " + trim(request.department()),
                "학년: " + optional(request.grade(), "선택 안 함"),
                "전화번호: " + trim(request.phone()),
                "이메일: " + trim(request.email()),
                "관심 분야: " + interestsText(request.interests()),
                "",
                "[지원 동기]",
                trim(request.motive()),
                "",
                "[관련 경험]",
                optional(request.experience(), "없음"),
                "",
                "[기대하는 활동]",
                trim(request.expectation())
        );
    }

    private static String interestsText(List<String> interests) {
        if (interests == null || interests.isEmpty()) {
            return "미선택";
        }

        return interests.stream()
                .map(RecruitApplicationService::trim)
                .filter(value -> !value.isBlank())
                .reduce((left, right) -> left + ", " + right)
                .orElse("미선택");
    }

    private static String optional(String value, String fallback) {
        String trimmed = trim(value);
        return trimmed.isBlank() ? fallback : trimmed;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String oneLine(String value) {
        return trim(value).replaceAll("[\\r\\n]+", " ");
    }
}
