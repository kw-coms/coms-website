package com.coms.backend.service;

import com.coms.backend.domain.Notice;
import com.coms.backend.domain.NoticeVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import com.coms.backend.repository.NoticeVoteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class NoticeService {

    private final NoticeRepository repo;
    private final MemberRepository memberRepository;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;
    private final NoticeVoteRepository voteRepository;
    private final RichContentSanitizer richContentSanitizer;

    public NoticeService(NoticeRepository repo, MemberRepository memberRepository, NotificationService notificationService,
                         AuditLogService auditLogService, NoticeVoteRepository voteRepository,
                         RichContentSanitizer richContentSanitizer) {
        this.repo = repo;
        this.memberRepository = memberRepository;
        this.notificationService = notificationService;
        this.auditLogService = auditLogService;
        this.voteRepository = voteRepository;
        this.richContentSanitizer = richContentSanitizer;
    }

    @Transactional(readOnly = true)
    public List<NoticeResponse> list() {
        return list(null);
    }

    @Transactional(readOnly = true)
    public List<NoticeResponse> list(String studentId) {
        List<Notice> notices = repo.findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc();
        Map<Long, VoteSummary> stats = voteStats(notices);
        return notices.stream().map(notice -> toResponse(notice, stats, studentId)).toList();
    }

    /**
     * One page of notices in the same order as {@link #list(String)}, fetched from the database with a
     * LIMIT instead of loading every row and slicing in memory. {@code total} is the unpaged row count
     * so callers can size their pager. Only used when a caller asks for pagination — the unpaged
     * {@link #list(String)} stays the default so existing clients see no change.
     */
    @Transactional(readOnly = true)
    public PagedNotices listPaged(String studentId, int page, int size) {
        List<Notice> notices = repo.findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc(
                org.springframework.data.domain.PageRequest.of(page, size));
        Map<Long, VoteSummary> stats = voteStats(notices);
        return new PagedNotices(notices.stream().map(notice -> toResponse(notice, stats, studentId)).toList(), repo.count());
    }

    public record PagedNotices(List<NoticeResponse> items, long total) {}

    /**
     * Returns at most {@code limit} notices in the same order as {@link #list()}, pushing the cap into
     * the query instead of loading every row and trimming in memory. Used by the mobile home preview.
     */
    @Transactional(readOnly = true)
    public List<NoticeResponse> listLimited(int limit) {
        List<Notice> notices = repo.findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc(
                org.springframework.data.domain.PageRequest.of(0, limit));
        Map<Long, VoteSummary> stats = voteStats(notices);
        return notices.stream().map(notice -> toResponse(notice, stats, null)).toList();
    }

    @Transactional(readOnly = true)
    public NoticeResponse get(Long id) {
        return toResponse(getEntity(id), Map.of(), null);
    }

    public NoticeResponse getAndIncrementView(Long id, String studentId) {
        Notice notice = getEntity(id);
        notice.incrementViewCount();
        Notice saved = repo.save(notice);
        return toResponse(saved, voteStats(List.of(saved)), studentId);
    }

    public NoticeResponse vote(String studentId, Long id, int value) {
        if (value < 0 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Notice notice = getEntity(id);
        Optional<NoticeVote> existing = voteRepository.findByNoticeIdAndStudentId(notice.getId(), studentId);
        if (value == 0 || existing.isPresent()) {
            existing.ifPresent(voteRepository::delete);
        } else {
            NoticeVote vote = new NoticeVote();
            vote.setNoticeId(notice.getId());
            vote.setStudentId(studentId);
            vote.setValue(1);
            voteRepository.save(vote);
        }
        auditLogService.record(studentId, "NOTICE_VOTE", "NOTICE", String.valueOf(notice.getId()), "value=" + value, null);
        return toResponse(notice, voteStats(List.of(notice)), studentId);
    }

    public NoticeResponse create(String authorStudentId, NoticeRequest request) {
        Notice notice = new Notice();
        applyRequest(notice, request, authorName(authorStudentId));
        Notice saved = repo.save(notice);
        notificationService.notifyNoticeCreated(saved);
        auditLogService.record(authorStudentId, "NOTICE_CREATE", "NOTICE", String.valueOf(saved.getId()), "title=" + saved.getTitle(), null);
        return toResponse(saved, voteStats(List.of(saved)), authorStudentId);
    }

    // 회장 전용 — SecurityConfig의 PATCH /api/notices/*/author hasRole("ADMIN") 규칙이 게이트.
    public NoticeResponse updateAuthor(String editorStudentId, Long id, String author) {
        Notice notice = getEntity(id);
        String cleaned = author == null ? "" : author.trim();
        if (cleaned.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "작성자 이름을 입력해주세요.");
        }
        notice.setAuthor(cleaned);
        auditLogService.record(editorStudentId, "NOTICE_AUTHOR_UPDATE", "NOTICE", String.valueOf(notice.getId()), "author=" + cleaned, null);
        return toResponse(notice, voteStats(List.of(notice)), editorStudentId);
    }

    public NoticeResponse update(String authorStudentId, Long id, NoticeRequest request) {
        Notice notice = getEntity(id);
        // Keep the displayed author on edits — previously every edit stomped it with the
        // editor's own name, which silently undid 회장 author overrides.
        applyRequest(notice, request, notice.getAuthor());
        auditLogService.record(authorStudentId, "NOTICE_UPDATE", "NOTICE", String.valueOf(notice.getId()), "title=" + notice.getTitle(), null);
        return toResponse(notice, voteStats(List.of(notice)), authorStudentId);
    }

    public NoticeResponse setPinned(String authorStudentId, Long id, boolean pinned) {
        Notice notice = getEntity(id);
        notice.setPinned(pinned);
        auditLogService.record(authorStudentId, "NOTICE_PIN", "NOTICE", String.valueOf(notice.getId()), "pinned=" + pinned, null);
        return toResponse(notice, voteStats(List.of(notice)), authorStudentId);
    }

    public void delete(String authorStudentId, Long id) {
        Notice notice = getEntity(id);
        repo.delete(notice);
        auditLogService.record(authorStudentId, "NOTICE_DELETE", "NOTICE", String.valueOf(id), "title=" + notice.getTitle(), null);
    }

    private Notice getEntity(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void applyRequest(Notice notice, NoticeRequest request, String authorName) {
        notice.setTitle(request.title());
        notice.setContent(richContentSanitizer.sanitizeContent(request.content()));
        notice.setAuthor(authorName);
        notice.setPinned(request.pinned());
        notice.setCategory(parseCategory(request.category()));
    }

    private String authorName(String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return member.getName();
    }

    private Notice.Category parseCategory(String value) {
        if (value == null || value.isBlank()) {
            return Notice.Category.GENERAL;
        }
        try {
            return Notice.Category.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid notice category.");
        }
    }

    private Map<Long, VoteSummary> voteStats(List<Notice> notices) {
        List<Long> ids = notices.stream().map(Notice::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return voteRepository.findByNoticeIdIn(ids).stream()
                .collect(Collectors.groupingBy(
                        NoticeVote::getNoticeId,
                        Collectors.collectingAndThen(Collectors.toList(), VoteSummary::from)
                ));
    }

    private NoticeResponse toResponse(Notice notice, Map<Long, VoteSummary> voteStats, String studentId) {
        VoteSummary votes = voteStats.getOrDefault(notice.getId(), VoteSummary.EMPTY);
        return new NoticeResponse(
                notice.getId(),
                notice.getTitle(),
                notice.getContent(),
                notice.getAuthor(),
                notice.isPinned(),
                notice.getCategory().name(),
                notice.getViewCount(),
                votes.upvotes(),
                votes.myVote(studentId),
                notice.getCreatedAt(),
                notice.getUpdatedAt()
        );
    }

    private record VoteSummary(long upvotes, Map<String, Integer> byStudent) {
        static final VoteSummary EMPTY = new VoteSummary(0, Map.of());

        static VoteSummary from(List<NoticeVote> votes) {
            long upvotes = votes.stream().filter(vote -> vote.getValue() > 0).count();
            Map<String, Integer> byStudent = votes.stream()
                    .collect(Collectors.toMap(NoticeVote::getStudentId, NoticeVote::getValue, (a, b) -> b));
            return new VoteSummary(upvotes, byStudent);
        }

        int myVote(String studentId) {
            return studentId == null ? 0 : byStudent.getOrDefault(studentId, 0);
        }
    }
}
