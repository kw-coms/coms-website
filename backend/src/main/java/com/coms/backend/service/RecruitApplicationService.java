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
import com.coms.backend.security.SlidingWindowRateLimiter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
import java.util.concurrent.Executor;

@Service
public class RecruitApplicationService {

    private static final Logger log = LoggerFactory.getLogger(RecruitApplicationService.class);
    private static final int MAX_APPLICATIONS_PER_WINDOW = 5;
    private static final Duration RATE_LIMIT_WINDOW = Duration.ofMinutes(10);
    // Status lookups are read-only but must be throttled to stop applicants (or scrapers)
    // from brute-forcing studentId/name pairs to learn who applied.
    private static final int MAX_STATUS_LOOKUPS_PER_WINDOW = 10;
    private static final Duration STATUS_LOOKUP_WINDOW = Duration.ofMinutes(10);
    // How long a decision can be looked up with a name and 학번. The decision log itself is kept
    // for good as a record; without a limit the public lookup would answer for every applicant
    // of every past season, to anyone who knows those two things about them.
    private static final int DECISION_LOOKUP_DAYS = 90;
    // A real applicant may resubmit to fix a typo; nobody needs more confirmations than this.
    private static final int MAX_CONFIRMATIONS_PER_RECIPIENT_PER_DAY = 3;
    // Far above a recruiting season's daily volume; stops the form being used as a mail cannon.
    private static final int MAX_CONFIRMATIONS_PER_DAY = 200;

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
    private final Executor mailExecutor;
    // The confirmation goes to whatever address the (anonymous) applicant typed, from the club's
    // own sender. Cap how often one address and the whole site can be mailed that way.
    private final SlidingWindowRateLimiter confirmationsByRecipient;
    private final SlidingWindowRateLimiter confirmationsForSite;

    /** Sends mail on the calling thread — for unit tests that construct the service directly. */
    public RecruitApplicationService(JavaMailSender mailSender,
                                     RecruitApplicationRepository recruitApplicationRepository,
                                     NotificationService notificationService,
                                     EligibleMemberService eligibleMemberService,
                                     RecruitPromotionLogRepository promotionLogRepository,
                                     Clock clock,
                                     boolean mailEnabled,
                                     String from,
                                     String to) {
        this(mailSender, recruitApplicationRepository, notificationService, eligibleMemberService,
                promotionLogRepository, clock, Runnable::run, mailEnabled, from, to);
    }

    @Autowired
    public RecruitApplicationService(JavaMailSender mailSender,
                                     RecruitApplicationRepository recruitApplicationRepository,
                                     NotificationService notificationService,
                                     EligibleMemberService eligibleMemberService,
                                     RecruitPromotionLogRepository promotionLogRepository,
                                     Clock clock,
                                     @Qualifier("mailExecutor") Executor mailExecutor,
                                     @Value("${mail.enabled:false}") boolean mailEnabled,
                                     @Value("${mail.from:no-reply@coms.kw.ac.kr}") String from,
                                     @Value("${recruit.mail.to:kwcoms69@gmail.com}") String to) {
        this.mailSender = mailSender;
        this.recruitApplicationRepository = recruitApplicationRepository;
        this.notificationService = notificationService;
        this.eligibleMemberService = eligibleMemberService;
        this.promotionLogRepository = promotionLogRepository;
        this.clock = clock;
        this.mailExecutor = mailExecutor;
        this.mailEnabled = mailEnabled;
        this.from = from;
        this.to = to;
        this.confirmationsByRecipient = new SlidingWindowRateLimiter(
                MAX_CONFIRMATIONS_PER_RECIPIENT_PER_DAY, Duration.ofDays(1), clock);
        this.confirmationsForSite = new SlidingWindowRateLimiter(
                MAX_CONFIRMATIONS_PER_DAY, Duration.ofDays(1), clock);
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

        SimpleMailMessage staffMessage = null;
        if (to != null && !to.isBlank()) {
            staffMessage = new SimpleMailMessage();
            staffMessage.setFrom(from);
            staffMessage.setTo(to.trim());
            staffMessage.setReplyTo(oneLine(request.email()));
            staffMessage.setSubject("[COM's 지원] " + oneLine(request.name()));
            staffMessage.setText(buildBody(request));
        }
        String recipient = oneLine(request.email()).toLowerCase(java.util.Locale.ROOT);
        SimpleMailMessage confirmation = null;
        if (confirmationsByRecipient.tryAcquire(recipient) && confirmationsForSite.tryAcquire("site")) {
            confirmation = buildApplicantConfirmationMessage(request);
        } else {
            log.warn("Recruit applicant confirmation skipped: daily mail limit reached");
        }
        SimpleMailMessage staff = staffMessage;
        SimpleMailMessage applicant = confirmation;
        dispatchAfterCommit(() -> sendMails(staff, applicant));
    }

    // Application is already saved and admins are notified in-app; a mail that cannot be
    // delivered must not fail the submission. The two mails are independent: with no staff
    // recipient configured (RECRUIT_MAIL_TO blank) the staff send used to throw, and the
    // applicant's confirmation — queued right behind it in the same try — was never sent.
    private void sendMails(SimpleMailMessage staffMessage, SimpleMailMessage confirmation) {
        if (staffMessage != null) {
            try {
                mailSender.send(staffMessage);
            } catch (RuntimeException e) {
                log.warn("Recruit application saved but staff notification email failed", e);
            }
        }
        if (confirmation != null) {
            try {
                mailSender.send(confirmation);
            } catch (RuntimeException e) {
                log.warn("Recruit application saved but applicant confirmation email failed", e);
            }
        }
    }

    // Mail goes out only after the application row has committed (a rolled-back submission must
    // not mail anyone), and off the request thread so a slow SMTP server never holds the request
    // and its database connection.
    private void dispatchAfterCommit(Runnable send) {
        Runnable enqueue = () -> {
            try {
                mailExecutor.execute(send);
            } catch (RuntimeException e) {
                log.warn("Recruit application saved but its emails could not be queued", e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    enqueue.run();
                }
            });
            return;
        }
        enqueue.run();
    }

    @Transactional(readOnly = true)
    public RecruitApplicationStatusResponse lookupStatus(RecruitApplicationStatusLookupRequest request, String clientIp) {
        enforceRateLimit(statusLookupAttemptsByClient, clientIp, MAX_STATUS_LOOKUPS_PER_WINDOW, STATUS_LOOKUP_WINDOW,
                "지원 현황 조회 요청이 많습니다. 잠시 후 다시 시도해주세요.");

        String studentId = trim(request.studentId());
        String name = trim(request.name());
        // Generic 404 on no match: never reveal whether the studentId or the name was the
        // mismatch, so the endpoint cannot be used as an enumeration oracle.
        return recruitApplicationRepository
                .findFirstByStudentIdAndNameOrderBySubmittedAtDescIdDesc(studentId, name)
                .map(application -> RecruitApplicationStatusResponse.from(application, statusLabel(application.getStatus())))
                // 합격/불합격 처리는 지원서를 지우고 처리 이력만 남긴다. 그 이력을 보지 않으면 결과가
                // 나온 지원자는 "지원 내역을 찾을 수 없습니다"만 보게 된다 — 정작 가장 궁금한 순간에.
                .or(() -> promotionLogRepository
                        .findFirstByStudentIdAndNameOrderByPromotedAtDescIdDesc(studentId, name)
                        .filter(decision -> decision.getPromotedAt() != null
                                && decision.getPromotedAt().isAfter(LocalDateTime.now(clock).minusDays(DECISION_LOOKUP_DAYS)))
                        .map(RecruitApplicationService::decidedStatus))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "일치하는 지원 내역을 찾을 수 없습니다."));
    }

    private static RecruitApplicationStatusResponse decidedStatus(RecruitPromotionLog decision) {
        RecruitApplication.Status status = decision.getDecision() == RecruitPromotionLog.Decision.REJECTED
                ? RecruitApplication.Status.REJECTED
                : RecruitApplication.Status.ACCEPTED;
        return RecruitApplicationStatusResponse.decided(status, statusLabel(status));
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
        } else if (status == RecruitApplication.Status.REJECTED) {
            reject(application, adminStudentId);
        }
        return response;
    }

    /**
     * 합격 처리: 지원서를 명부로 이관하고(현재 연도 기수, 전화번호 포함), 처리 이력을
     * 별도 로그로 남긴 뒤 지원서를 삭제한다. 명부 upsert가 실패하면 전체가 롤백되어
     * 지원서가 사라지는 일은 없다.
     */
    private void promote(RecruitApplication application, String adminStudentId) {
        // 명부는 학번 기준 upsert다. 같은 학번이 이미 다른 이름으로 등록돼 있으면 그 행을
        // 덮어쓰지 말고 409로 중단한다 — 예외가 트랜잭션을 롤백하므로 상태 변경도 되돌아간다.
        eligibleMemberService.ensureStudentIdNotTakenByOtherName(application.getStudentId(), application.getName());
        String generation = String.valueOf(Year.now(clock).getValue() - FIRST_GENERATION_YEAR);
        // 리크루팅 합격자는 가입하면 준회원(ASSOCIATE)으로 시작한다. 정회원 승격은 관리자 수기 처리.
        eligibleMemberService.addSingle(
                application.getStudentId(),
                application.getName(),
                generation,
                application.getPhone(),
                com.coms.backend.domain.Member.Role.ASSOCIATE
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
        log.setDecision(RecruitPromotionLog.Decision.ACCEPTED);
        log.setAdminNote(truncateAdminNote(application.getAdminNote()));
        promotionLogRepository.save(log);

        recruitApplicationRepository.delete(application);
    }

    /**
     * 불합격 처리: 지원서를 삭제하되 처리 이력은 남긴다. 합격 이관과 같은 로그 테이블을
     * 재사용하지만, 명부에 올라간 적이 없으므로 기수는 없고, 연락처(전화번호/이메일)는
     * 개인정보 최소 보유 원칙에 따라 저장하지 않는다.
     */
    private void reject(RecruitApplication application, String adminStudentId) {
        RecruitPromotionLog log = new RecruitPromotionLog();
        log.setApplicationId(application.getId());
        log.setName(application.getName());
        log.setStudentId(application.getStudentId());
        log.setDepartment(application.getDepartment());
        log.setPhone(null);
        log.setEmail(null);
        log.setPromotedBy(adminStudentId);
        log.setDecision(RecruitPromotionLog.Decision.REJECTED);
        log.setAdminNote(truncateAdminNote(application.getAdminNote()));
        promotionLogRepository.save(log);

        recruitApplicationRepository.delete(application);
    }

    // admin_note 컬럼은 500자까지다(지원서 자체의 운영 메모는 최대 1000자 허용) — 로그에
    // 옮겨 적을 때 DB 예외 없이 조용히 잘라낸다.
    private static String truncateAdminNote(String adminNote) {
        if (adminNote == null || adminNote.length() <= 500) {
            return adminNote;
        }
        return adminNote.substring(0, 500);
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
                // 이 메일은 로그인 없이 누구나 적어 넣은 주소로, 동아리 공식 발신 주소에서 나간다.
                // 그래서 제출자가 입력한 글(이름·학과·관심 분야 등)은 한 글자도 싣지 않는다. 그 칸에
                // 링크나 안내문을 적어 남에게 공식 메일처럼 보내는 데 쓰일 수 있기 때문이다.
                "안녕하세요.",
                "",
                "COM's 지원서가 정상적으로 접수되었습니다.",
                "내부 확인 후 지원서에 적어 주신 연락처로 개별 연락드리겠습니다.",
                "진행 상황은 COM's 웹사이트 지원하기 페이지의 '지원 현황 확인'에서 학번과 이름으로 볼 수 있습니다.",
                "",
                "직접 지원하지 않으셨다면 다른 사람이 이 주소를 잘못 적은 것이니 이 메일을 무시해 주세요.",
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
