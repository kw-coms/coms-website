package com.coms.backend.service;

import com.coms.backend.domain.HackathonReview;
import com.coms.backend.domain.HackathonEvent;
import com.coms.backend.dto.HackathonEventReviewResponse;
import com.coms.backend.repository.HackathonEventRepository;
import com.coms.backend.repository.HackathonProjectRepository;
import com.coms.backend.dto.HackathonReviewRequest;
import com.coms.backend.dto.HackathonReviewResponse;
import com.coms.backend.dto.HackathonScoresRequest;
import com.coms.backend.repository.HackathonReviewRepository;

import com.coms.backend.security.SlidingWindowRateLimiter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Year;
import java.time.ZoneId;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
public class HackathonService {
    private static final String CHAIR_KEY = "chair";
    private final HackathonReviewRepository reviews;
    private final HackathonEventRepository events;
    private final HackathonProjectRepository projects;
    private final Clock clock;
    private final TransactionTemplate transactions;
    private final SlidingWindowRateLimiter guestSubmissionsByIp;
    private final SlidingWindowRateLimiter memberSubmissionsById;

    public HackathonService(HackathonReviewRepository reviews, HackathonEventRepository events,
                            HackathonProjectRepository projects, Clock clock, PlatformTransactionManager transactionManager) {
        this.reviews = reviews;
        this.events = events;
        this.projects = projects;
        this.clock = clock;
        transactions = new TransactionTemplate(transactionManager);
        guestSubmissionsByIp = new SlidingWindowRateLimiter(10, Duration.ofMinutes(1), clock);
        memberSubmissionsById = new SlidingWindowRateLimiter(120, Duration.ofMinutes(1), clock);
    }

    public boolean isOpen() {
        return events.findById(1L).map(HackathonEvent::isOpen).orElse(false);
    }

    public String submit(HackathonReviewRequest request, String clientIp, String reviewerStudentId) {
        return submit(1L, request, clientIp, reviewerStudentId);
    }

    public String submit(Long eventId, HackathonReviewRequest request, String clientIp, String reviewerStudentId) {
        if (request == null || request.projectId() == null) throw invalid();
        HackathonEvent visible = events.findById(eventId).orElseThrow(HackathonService::notFound);
        if (!visible.isPublished()) throw notFound();
        if (reviewerStudentId == null && !visible.isAllowGuestReviews()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "비회원 평가는 허용되지 않습니다.");
        }
        if (!projects.existsByEventIdAndIdAndPublishedTrue(eventId, request.projectId())) {
            if (eventId == 1L) throw invalid();
            throw notFound();
        }
        int generation = checkedInt(request.generation(), 1, currentGeneration(clock));
        String name = request.name() == null ? "" : Normalizer.normalize(request.name(), Normalizer.Form.NFKC)
                .strip().replaceAll("(?U)\\s+", " ");
        String nameKey = name.replaceAll("(?U)\\s+", "").toLowerCase(Locale.ROOT);
        if (name.length() < 2 || name.length() > 40 || nameKey.isEmpty()
                || name.codePoints().anyMatch(Character::isISOControl)) throw invalid();
        String feedback = checkedFeedback(request.feedback());
        int[] scores = checkedScores(request.themeFit(), request.creativity(), request.technology(),
                request.completeness(), request.practicality());
        if (!(reviewerStudentId == null ? guestSubmissionsByIp.tryAcquire(clientIp)
                : memberSubmissionsById.tryAcquire(reviewerStudentId))) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "요청이 많습니다. 잠시 후 다시 시도해주세요.");
        }
        try {
            transactions.executeWithoutResult(status -> {
                HackathonEvent state = events.lockById(eventId).orElse(null);
                if (state == null || !state.isOpen()) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "해커톤 평가가 마감되었습니다.");
                }
                if (reviewerStudentId == null && !state.isAllowGuestReviews()) {
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "비회원 평가는 허용되지 않습니다.");
                }
                if (!projects.existsByEventIdAndIdAndPublishedTrue(eventId, request.projectId())) throw notFound();
                if (reviews.existsByEventIdAndProjectIdAndGenerationAndNameKey(eventId, request.projectId(), generation, nameKey)) {
                    throw duplicate();
                }
                if (reviewerStudentId == null && reviews.existsByEventIdAndProjectIdAndIpKey(eventId, request.projectId(), clientIp)) throw duplicateIp();
                if (reviewerStudentId != null && reviews.existsByEventIdAndProjectIdAndReviewerStudentId(eventId, request.projectId(), reviewerStudentId)) throw duplicateMember();
                HackathonReview row = new HackathonReview();
                row.setEventId(eventId);
                row.setProjectId(request.projectId());
                row.setGeneration(generation);
                row.setName(name);
                row.setNameKey(nameKey);
                row.setIpKey(reviewerStudentId == null ? clientIp : null);
                row.setReviewerStudentId(reviewerStudentId);
                copyScores(row, scores, feedback);
                row.setCreatedAt(LocalDateTime.now(clock));
                reviews.saveAndFlush(row);
            });
        } catch (DataIntegrityViolationException ex) {
            // The unique key decides when two requests pass the preliminary duplicate check together.
            if (reviews.existsByEventIdAndProjectIdAndGenerationAndNameKey(eventId, request.projectId(), generation, nameKey)) {
                throw duplicate();
            }
            if (reviewerStudentId == null && reviews.existsByEventIdAndProjectIdAndIpKey(eventId, request.projectId(), clientIp)) throw duplicateIp();
            if (reviewerStudentId != null && reviews.existsByEventIdAndProjectIdAndReviewerStudentId(eventId, request.projectId(), reviewerStudentId)) throw duplicateMember();
            throw ex;
        }
        return request.projectId();
    }

    @Transactional(readOnly = true)
    public List<HackathonReviewResponse> list() {
        return list(1L);
    }

    @Transactional(readOnly = true)
    public List<HackathonReviewResponse> list(Long eventId) {
        events.findById(eventId).orElseThrow(HackathonService::notFound);
        return reviews.findByEventIdOrderByCreatedAtAscIdAsc(eventId).stream().map(HackathonReviewResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<HackathonEventReviewResponse> listEvent(Long eventId) {
        events.findById(eventId).orElseThrow(HackathonService::notFound);
        return reviews.findByEventIdOrderByCreatedAtAscIdAsc(eventId).stream().map(HackathonEventReviewResponse::from).toList();
    }

    @Transactional
    public void deleteReview(Long id) { deleteReview(1L, id); }

    @Transactional
    public void deleteReview(Long eventId, Long id) {
        requireScoresEditable(events.lockById(eventId).orElseThrow(HackathonService::notFound));
        HackathonReview review = reviews.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "평가를 찾을 수 없습니다."));
        if (!eventId.equals(review.getEventId())) throw notFound();
        reviews.delete(review);
    }

    @Transactional
    public HackathonReviewResponse saveChair(String projectId, HackathonScoresRequest request) {
        return saveChair(1L, projectId, request);
    }

    @Transactional
    public HackathonReviewResponse saveChair(Long eventId, String projectId, HackathonScoresRequest request) {
        HackathonEvent event = events.lockById(eventId).orElseThrow(HackathonService::notFound);
        if (!event.isPublished()) throw new ResponseStatusException(HttpStatus.CONFLICT, "공개된 행사에만 회장 점수를 저장할 수 있습니다.");
        requireScoresEditable(event);
        if (!projects.existsByEventIdAndIdAndPublishedTrue(eventId, projectId) || request == null) throw invalid();
        String feedback = checkedFeedback(request.feedback());
        int[] scores = checkedScores(request.themeFit(), request.creativity(), request.technology(),
                request.completeness(), request.practicality());
        HackathonReview row = reviews.findByEventIdAndProjectIdAndGenerationAndNameKey(eventId, projectId, 0, CHAIR_KEY)
                .orElseGet(HackathonReview::new);
        row.setEventId(eventId);
        row.setProjectId(projectId);
        row.setGeneration(0);
        row.setName("회장");
        row.setNameKey(CHAIR_KEY);
        row.setChair(true);
        copyScores(row, scores, feedback);
        if (row.getId() == null) row.setCreatedAt(LocalDateTime.now(clock));
        return HackathonReviewResponse.from(reviews.saveAndFlush(row));
    }

    @Transactional
    public boolean setOpen(Boolean open) {
        if (open == null) throw invalid();
        return setOpen(1L, open);
    }

    @Transactional
    public boolean setOpen(Long eventId, Boolean open) {
        if (open == null) throw invalid();
        HackathonEvent event = events.lockById(eventId).orElseThrow(HackathonService::notFound);
        if (open && (!event.isPublished() || projects.countByEventIdAndPublishedTrue(eventId) == 0))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "공개된 행사에 작품이 있어야 평가를 열 수 있습니다.");
        event.setOpen(open);
        if (open) event.setResultsPublished(false);
        events.saveAndFlush(event);
        return open;
    }

    private static void requireScoresEditable(HackathonEvent event) {
        if (event.isResultsPublished()) throw new ResponseStatusException(HttpStatus.CONFLICT, "결과를 공개한 상태에서는 점수를 바꿀 수 없습니다. 결과 공개를 먼저 끄세요.");
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "행사를 찾을 수 없습니다.");
    }

    private static ResponseStatusException duplicateIp() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "이 접속 주소에서 이 팀의 평가를 이미 제출했습니다.");
    }

    private static ResponseStatusException duplicateMember() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "이 계정으로 이 팀의 평가를 이미 제출했습니다.");
    }

    @Transactional
    public boolean setAllowGuestReviews(Long eventId, Boolean allowed) {
        if (allowed == null) throw invalid();
        HackathonEvent event = events.lockById(eventId).orElseThrow(HackathonService::notFound);
        event.setAllowGuestReviews(allowed);
        events.saveAndFlush(event);
        return allowed;
    }

    private static String checkedFeedback(String feedback) {
        String value = feedback == null ? "" : feedback.strip();
        if (value.length() > 2000 || value.codePoints().anyMatch(cp -> Character.isISOControl(cp) && cp != '\n' && cp != '\t')) {
            throw invalid();
        }
        return value;
    }

    private static int[] checkedScores(BigDecimal... scores) {
        int[] checked = new int[scores.length];
        for (int i = 0; i < scores.length; i++) checked[i] = checkedInt(scores[i], 0, 20);
        return checked;
    }

    /** 올해 들어오는 기수(서울 기준 연도 - 1966). 화면의 currentGeneration()과 같은 기준이다. */
    static int currentGeneration(Clock clock) {
        return Year.now(clock.withZone(ZoneId.of("Asia/Seoul"))).getValue() - 1966;
    }

    private static int checkedInt(BigDecimal value, int min, int max) {
        if (value == null) throw invalid();
        try {
            int number = value.intValueExact();
            if (number < min || number > max) throw invalid();
            return number;
        } catch (ArithmeticException ex) {
            throw invalid();
        }
    }

    private static void copyScores(HackathonReview row, int[] scores, String feedback) {
        row.setThemeFit(scores[0]);
        row.setCreativity(scores[1]);
        row.setTechnology(scores[2]);
        row.setCompleteness(scores[3]);
        row.setPracticality(scores[4]);
        row.setFeedback(feedback);
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "입력값을 확인해주세요.");
    }

    private static ResponseStatusException duplicate() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "이 기수와 이름으로 이 팀의 평가를 이미 제출했습니다.");
    }
}
