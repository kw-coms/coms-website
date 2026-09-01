package com.coms.backend.service;

import com.coms.backend.domain.RecruitApplication;
import com.coms.backend.domain.RecruitPromotionLog;
import com.coms.backend.dto.RecruitApplicationAdminResponse;
import com.coms.backend.dto.RecruitPromotionLogResponse;
import com.coms.backend.dto.RecruitApplicationRequest;
import com.coms.backend.dto.RecruitApplicationStatusLookupRequest;
import com.coms.backend.dto.RecruitApplicationStatusResponse;
import com.coms.backend.dto.RecruitApplicationStatusUpdateRequest;
import com.coms.backend.repository.RecruitApplicationRepository;
import com.coms.backend.repository.RecruitPromotionLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.Year;
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
    // Status lookups are read-only but must be throttled to stop applicants (or scrapers)
    // from brute-forcing studentId/name pairs to learn who applied.
    private static final int MAX_STATUS_LOOKUPS_PER_WINDOW = 10;
    private static final Duration STATUS_LOOKUP_WINDOW = Duration.ofMinutes(10);

    private static final Map<RecruitApplication.Status, String> STATUS_LABELS = Map.of(
            RecruitApplication.Status.RECEIVED, "지원 완료",
            RecruitApplication.Status.REVIEWING, "검토 중",
            RecruitApplication.Status.ACCEPTED, "합격",
            RecruitApplication.Status.HOLD, "면접",
            RecruitApplication.Status.REJECTED, "불합격"
    );

    private static final int FIRST_GENERATION_YEAR = 1966;

    private final JavaMailSender mailSender;
    private final RecruitApplicationRepository recruitApplicationRepository;
    private final NotificationService notificationService;
    private final EligibleMemberService eligibleMemberService;
    private final RecruitPromotionLogRepository promotionLogRepository;
    private final Clock clock;
    private final boolean mailEnabled;
    private final String from;
    private final String to;
    private final Map<String, Deque<LocalDateTime>> submissionAttemptsByClient = new ConcurrentHashMap<>();
    private final Map<String, Deque<LocalDateTime>> statusLookupAttemptsByClient = new ConcurrentHashMap<>();

    public RecruitApplicationService(JavaMailSender mailSender,
                                     RecruitApplicationRepository recruitApplicationRepository,
                                     NotificationService notificationService,
                                     EligibleMemberService eligibleMemberService,
                                     RecruitPromotionLogRepository promotionLogRepository,
                                     Clock clock,
                                     @Value("${mail.enabled:false}") boolean mailEnabled,
                                     @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from,
                                     @Value("${recruit.mail.to:kwcoms69@gmail.com}") String to) {
        this.mailSender = mailSender;
        this.recruitApplicationRepository = recruitApplicationRepository;
        this.notificationService = notificationService;
        this.eligibleMemberService = eligibleMemberService;
        this.promotionLogRepository = promotionLogRepository;
        this.clock = clock;
        this.mailEnabled = mailEnabled;
        this.from = from;
        this.to = to;
    }

    @Transactional
    public void sendApplication(RecruitApplicationRequest request, String clientIp) {
        enforceRateLimit(submissionAttemptsByClient, clientIp, MAX_APPLICATIONS_PER_WINDOW, RATE_LIMIT_WINDOW,
                "지원서 제출 요청이 많습니다. 잠시 후 다시 시도해주세요.");

        // Persist + alert admins first so an application is never lost — even when
        // email is disabled or the SMTP server is unreachable. Email is best-effort.
        RecruitApplication application = recruitApplicationRepository.save(toEntity(request, clientIp));
        notificationService.notifyRecruitApplication(application);

        if (!mailEnabled) {
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setReplyTo(oneLine(request.email()));
            message.setSubject("[COM's 지원] " + oneLine(request.name()));
            message.setText(buildBody(request));
            mailSender.send(message);
            mailSender.send(buildApplicantConfirmationMessage(request));
        } catch (RuntimeException e) {
            // Application is already saved and admins are notified in-app; don't fail the
            // submission just because the notification email could not be delivered.
            log.warn("Recruit application saved but notification email failed for studentId={}", request.studentId(), e);
        }
    }

    @Transactional(readOnly = true)
    public RecruitApplicationStatusResponse lookupStatus(RecruitApplicationStatusLookupRequest request, String clientIp) {
        enforceRateLimit(statusLookupAttemptsByClient, clientIp, MAX_STATUS_LOOKUPS_PER_WINDOW, STATUS_LOOKUP_WINDOW,
                "지원 현황 조회 요청이 많습니다. 잠시 후 다시 시도해주세요.");

        // Generic 404 on no match: never reveal whether the studentId or the name was the
        // mismatch, so the endpoint cannot be used as an enumeration oracle.
        return recruitApplicationRepository
                .findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(trim(request.studentId()), trim(request.name()))
                .map(application -> RecruitApplicationStatusResponse.from(application, statusLabel(application.getStatus())))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "일치하는 지원 내역을 찾을 수 없습니다."));
    }

    private static String statusLabel(RecruitApplication.Status status) {
        return STATUS_LABELS.getOrDefault(status, status.name());
    }

    @Transactional(readOnly = true)
    public List<RecruitApplicationAdminResponse> listApplications() {
        return recruitApplicationRepository.findAllByOrderBySubmittedAtDescIdDesc().stream()
                .map(RecruitApplicationAdminResponse::from)
                .toList();
    }

    @Transactional
    public RecruitApplicationAdminResponse updateStatus(Long id, RecruitApplicationStatusUpdateRequest request, String adminStudentId) {
        RecruitApplication application = recruitApplicationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "지원서를 찾을 수 없습니다."));
        RecruitApplication.Status status = parseStatus(request.status());
        application.setStatus(status);
        application.setAdminNote(trimToNull(request.adminNote()));
        RecruitApplicationAdminResponse response = RecruitApplicationAdminResponse.from(application);
        if (status == RecruitApplication.Status.ACCEPTED) {
            promote(application, adminStudentId);
        }
        return response;
    }

    /**
     * 합격 처리: 지원서를 명부로 이관하고(현재 연도 기수, 전화번호 포함), 이관 이력을
     * 별도 로그로 남긴 뒤 지원서를 삭제한다. 명부 upsert가 실패하면 전체가 롤백되어
     * 지원서가 사라지는 일은 없다.
     */
    private void promote(RecruitApplication application, String adminStudentId) {
        String generation = String.valueOf(Year.now(clock).getValue() - FIRST_GENERATION_YEAR);
        eligibleMemberService.addSingle(
                application.getStudentId(),
                application.getName(),
                generation,
                application.getPhone()
        );

        RecruitPromotionLog log = new RecruitPromotionLog();
        log.setApplicationId(application.getId());
        log.setName(application.getName());
        log.setStudentId(application.getStudentId());
        log.setDepartment(application.getDepartment());
        log.setPhone(application.getPhone());
        log.setEmail(application.getEmail());
        log.setGeneration(generation);
        log.setPromotedBy(adminStudentId);
        promotionLogRepository.save(log);

        recruitApplicationRepository.delete(application);
    }

    @Transactional(readOnly = true)
    public List<RecruitPromotionLogResponse> listPromotions() {
        return promotionLogRepository.findTop100ByOrderByPromotedAtDescIdDesc().stream()
                .map(RecruitPromotionLogResponse::from)
                .toList();
    }

    private static RecruitApplication.Status parseStatus(String rawStatus) {
        try {
            return RecruitApplication.Status.valueOf(trim(rawStatus).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원서 상태 값이 올바르지 않습니다.");
        }
    }

    private static RecruitApplication toEntity(RecruitApplicationRequest request, String clientIp) {
        RecruitApplication application = new RecruitApplication();
        application.setName(trim(request.name()));
        application.setStudentId(trim(request.studentId()));
        application.setDepartment(trim(request.department()));
        application.setGrade(trimToNull(request.grade()));
        application.setPhone(trim(request.phone()));
        application.setEmail(trim(request.email()));
        application.setInterests(interestsText(request.interests()));
        application.setMotive(trim(request.motive()));
        application.setExperience(trimToNull(request.experience()));
        application.setExpectation(trim(request.expectation()));
        application.setClientIp(trimToNull(clientIp));
        return application;
    }

    private void enforceRateLimit(Map<String, Deque<LocalDateTime>> attemptsByClient, String clientIp,
                                  int maxPerWindow, Duration window, String message) {
        String key = clientIp == null || clientIp.isBlank() ? "unknown" : clientIp;
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minus(window);
        Deque<LocalDateTime> attempts = attemptsByClient.computeIfAbsent(key, ignored -> new ArrayDeque<>());

        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= maxPerWindow) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
            }
            attempts.addLast(now);
        }

        evictExpiredClients(attemptsByClient, cutoff);
    }

    // Purge clients whose entire window has expired so the in-memory map cannot leak memory.
    private void evictExpiredClients(Map<String, Deque<LocalDateTime>> attemptsByClient, LocalDateTime cutoff) {
        attemptsByClient.forEach((key, attempts) -> {
            synchronized (attempts) {
                LocalDateTime last = attempts.peekLast();
                if (last == null || last.isBefore(cutoff)) {
                    attemptsByClient.remove(key, attempts);
                }
            }
        });
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

    private SimpleMailMessage buildApplicantConfirmationMessage(RecruitApplicationRequest request) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(oneLine(request.email()));
        message.setSubject("[COM's] 지원서가 접수되었습니다");
        message.setText(String.join("\n",
                "안녕하세요, " + trim(request.name()) + "님.",
                "",
                "COM's 지원서가 정상적으로 접수되었습니다.",
                "내부 확인 후 입력하신 연락처 또는 이메일로 개별 연락드리겠습니다.",
                "",
                "[접수 내용 요약]",
                "이름: " + trim(request.name()),
                "학번: " + trim(request.studentId()),
                "학과: " + trim(request.department()),
                "학년: " + optional(request.grade(), "선택 안 함"),
                "관심 분야: " + interestsText(request.interests()),
                "",
                "지원해주셔서 감사합니다.",
                "COM's"
        ));
        return message;
    }

    private static String optional(String value, String fallback) {
        String trimmed = trim(value);
        return trimmed.isBlank() ? fallback : trimmed;
    }

    private static String trimToNull(String value) {
        String trimmed = trim(value);
        return trimmed.isBlank() ? null : trimmed;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String oneLine(String value) {
        return trim(value).replaceAll("[\\r\\n]+", " ");
    }
}
