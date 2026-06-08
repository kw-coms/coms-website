package com.coms.backend.service;

import com.coms.backend.domain.Notice;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class NoticeService {

    private final NoticeRepository repo;
    private final MemberRepository memberRepository;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;

    public NoticeService(NoticeRepository repo, MemberRepository memberRepository, NotificationService notificationService,
                         AuditLogService auditLogService) {
        this.repo = repo;
        this.memberRepository = memberRepository;
        this.notificationService = notificationService;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public List<NoticeResponse> list() {
        return repo.findAllByOrderByPinnedDescCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public NoticeResponse get(Long id) {
        return toResponse(getEntity(id));
    }

    public NoticeResponse create(String authorStudentId, NoticeRequest request) {
        Notice notice = new Notice();
        applyRequest(notice, request, authorName(authorStudentId));
        Notice saved = repo.save(notice);
        notificationService.notifyNoticeCreated(saved);
        auditLogService.record(authorStudentId, "NOTICE_CREATE", "NOTICE", String.valueOf(saved.getId()), "title=" + saved.getTitle(), null);
        return toResponse(saved);
    }

    public NoticeResponse update(String authorStudentId, Long id, NoticeRequest request) {
        Notice notice = getEntity(id);
        applyRequest(notice, request, authorName(authorStudentId));
        auditLogService.record(authorStudentId, "NOTICE_UPDATE", "NOTICE", String.valueOf(notice.getId()), "title=" + notice.getTitle(), null);
        return toResponse(notice);
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
        notice.setContent(request.content());
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

    private NoticeResponse toResponse(Notice notice) {
        return new NoticeResponse(
                notice.getId(),
                notice.getTitle(),
                notice.getContent(),
                notice.getAuthor(),
                notice.isPinned(),
                notice.getCategory().name(),
                notice.getCreatedAt(),
                notice.getUpdatedAt()
        );
    }
}
