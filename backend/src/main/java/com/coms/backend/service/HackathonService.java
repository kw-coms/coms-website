package com.coms.backend.service;

import com.coms.backend.domain.HackathonReview;
import com.coms.backend.domain.HackathonSettings;
import com.coms.backend.dto.HackathonReviewRequest;
import com.coms.backend.dto.HackathonReviewResponse;
import com.coms.backend.dto.HackathonScoresRequest;
import com.coms.backend.repository.HackathonReviewRepository;
import com.coms.backend.repository.HackathonSettingsRepository;
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
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
public class HackathonService {
    private static final String CHAIR_KEY = "chair";
    private final HackathonReviewRepository reviews;
    private final HackathonSettingsRepository settings;
    private final Clock clock;
    private final TransactionTemplate transactions;
    private final SlidingWindowRateLimiter submissionsByIp;

    public HackathonService(HackathonReviewRepository reviews, HackathonSettingsRepository settings,
                            Clock clock, PlatformTransactionManager transactionManager) {
        this.reviews = reviews;
        this.settings = settings;
        this.clock = clock;
        transactions = new TransactionTemplate(transactionManager);
        submissionsByIp = new SlidingWindowRateLimiter(120, Duration.ofMinutes(1), clock);
    }

    public boolean isOpen() {
        return settings.findById((short) 1).map(HackathonSettings::isOpen).orElse(false);
    }

    public String submit(HackathonReviewRequest request, String clientIp) {
        if (request == null || !validProject(request.projectId())) throw invalid();
        int generation = checkedInt(request.generation(), 1, 60);
        String name = request.name() == null ? "" : Normalizer.normalize(request.name(), Normalizer.Form.NFKC)
                .strip().replaceAll("(?U)\\s+", " ");
        String nameKey = name.replaceAll("(?U)\\s+", "").toLowerCase(Locale.ROOT);
        if (name.length() < 2 || name.length() > 40 || nameKey.isEmpty()
                || name.codePoints().anyMatch(Character::isISOControl)) throw invalid();
        String feedback = checkedFeedback(request.feedback());
        int[] scores = checkedScores(request.themeFit(), request.creativity(), request.technology(),
                request.completeness(), request.practicality());
        if (!submissionsByIp.tryAcquire(clientIp)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "요청이 많습니다. 잠시 후 다시 시도해주세요.");
        }
        try {
            transactions.executeWithoutResult(status -> {
                HackathonSettings state = settings.lockState().orElse(null);
                if (state == null || !state.isOpen()) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "해커톤 평가가 마감되었습니다.");
                }
                if (reviews.existsByProjectIdAndGenerationAndNameKey(request.projectId(), generation, nameKey)) {
                    throw duplicate();
                }
                HackathonReview row = new HackathonReview();
                row.setProjectId(request.projectId());
                row.setGeneration(generation);
                row.setName(name);
                row.setNameKey(nameKey);
                copyScores(row, scores, feedback);
                row.setCreatedAt(LocalDateTime.now(clock));
                reviews.saveAndFlush(row);
            });
        } catch (DataIntegrityViolationException ex) {
            // The unique key decides when two requests pass the preliminary duplicate check together.
            if (reviews.existsByProjectIdAndGenerationAndNameKey(request.projectId(), generation, nameKey)) {
                throw duplicate();
            }
            throw ex;
        }
        return request.projectId();
    }

    @Transactional(readOnly = true)
    public List<HackathonReviewResponse> list() {
        return reviews.findAllByOrderByCreatedAtAscIdAsc().stream().map(HackathonReviewResponse::from).toList();
    }

    @Transactional
    public HackathonReviewResponse saveChair(String projectId, HackathonScoresRequest request) {
        if (!validProject(projectId) || request == null) throw invalid();
        String feedback = checkedFeedback(request.feedback());
        int[] scores = checkedScores(request.themeFit(), request.creativity(), request.technology(),
                request.completeness(), request.practicality());
        HackathonReview row = reviews.findByProjectIdAndGenerationAndNameKey(projectId, 0, CHAIR_KEY)
                .orElseGet(HackathonReview::new);
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
        HackathonSettings state = settings.lockState().orElseGet(HackathonSettings::new);
        state.setOpen(open);
        settings.save(state);
        return open;
    }

    private static boolean validProject(String id) {
        return "wargether".equals(id) || "underground-route".equals(id) || "still".equals(id);
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
