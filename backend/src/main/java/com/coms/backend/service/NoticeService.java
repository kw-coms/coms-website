package com.coms.backend.service;

import com.coms.backend.domain.Notice;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.repository.NoticeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class NoticeService {

    private final NoticeRepository repo;

    public NoticeService(NoticeRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public List<NoticeResponse> list() {
        return repo.findAllByOrderByPinnedDescCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public NoticeResponse get(Long id) {
        return toResponse(getEntity(id));
    }

    public NoticeResponse create(NoticeRequest request) {
        Notice notice = new Notice();
        applyRequest(notice, request);
        return toResponse(repo.save(notice));
    }

    public NoticeResponse update(Long id, NoticeRequest request) {
        Notice notice = getEntity(id);
        applyRequest(notice, request);
        return toResponse(notice);
    }

    public void delete(Long id) {
        repo.delete(getEntity(id));
    }

    private Notice getEntity(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void applyRequest(Notice notice, NoticeRequest request) {
        notice.setTitle(request.title());
        notice.setContent(request.content());
        notice.setAuthor(request.author());
        notice.setPinned(request.pinned());
    }

    private NoticeResponse toResponse(Notice notice) {
        return new NoticeResponse(
                notice.getId(),
                notice.getTitle(),
                notice.getContent(),
                notice.getAuthor(),
                notice.isPinned(),
                notice.getCreatedAt(),
                notice.getUpdatedAt()
        );
    }
}
