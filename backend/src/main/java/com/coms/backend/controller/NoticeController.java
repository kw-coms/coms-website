package com.coms.backend.controller;

import com.coms.backend.dto.EngagementVoteRequest;
import com.coms.backend.dto.NoticeAuthorUpdateRequest;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.dto.PinRequest;
import com.coms.backend.service.NoticeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.coms.backend.web.ListPagination;

import java.util.List;

@RestController
@RequestMapping("/api/notices")
public class NoticeController {

    private final NoticeService noticeService;

    public NoticeController(NoticeService noticeService) {
        this.noticeService = noticeService;
    }

    /**
     * Optional, backward-compatible pagination: with neither param the full array is returned
     * exactly as before (the web 공지사항 page and the member app both rely on that shape). With
     * page/size the response is still a bare array — one page of it — plus X-Total-Count.
     */
    @GetMapping
    public ResponseEntity<List<NoticeResponse>> list(Authentication authentication,
                                                     @RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer size) {
        if (page == null && size == null) {
            return ResponseEntity.ok(noticeService.list(studentId(authentication)));
        }
        ListPagination.Resolved resolved = ListPagination.resolve(page, size);
        NoticeService.PagedNotices paged = noticeService.listPaged(studentId(authentication), resolved.page(), resolved.size());
        return ListPagination.paginated(paged.items(), paged.total());
    }

    @GetMapping("/{id}")
    public ResponseEntity<NoticeResponse> get(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(noticeService.getAndIncrementView(id, studentId(authentication)));
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<NoticeResponse> vote(Authentication authentication,
                                               @PathVariable Long id,
                                               @Valid @RequestBody EngagementVoteRequest request) {
        return ResponseEntity.ok(noticeService.vote(authentication.getName(), id, request.value()));
    }

    private String studentId(Authentication authentication) {
        return authentication == null ? null : authentication.getName();
    }

    @PostMapping
    public ResponseEntity<NoticeResponse> create(Authentication authentication,
                                                 @Valid @RequestBody NoticeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(noticeService.create(authentication.getName(), request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoticeResponse> update(Authentication authentication,
                                                 @PathVariable Long id,
                                                 @Valid @RequestBody NoticeRequest request) {
        return ResponseEntity.ok(noticeService.update(authentication.getName(), id, request));
    }

    @PatchMapping("/{id}/pin")
    public ResponseEntity<NoticeResponse> pin(Authentication authentication,
                                              @PathVariable Long id,
                                              @Valid @RequestBody PinRequest request) {
        return ResponseEntity.ok(noticeService.setPinned(authentication.getName(), id, request.pinned()));
    }

    // 회장 전용 — SecurityConfig의 PATCH /api/notices/*/author hasRole("ADMIN") 규칙이 게이트.
    @PatchMapping("/{id}/author")
    public ResponseEntity<NoticeResponse> updateAuthor(Authentication authentication,
                                                       @PathVariable Long id,
                                                       @Valid @RequestBody NoticeAuthorUpdateRequest request) {
        return ResponseEntity.ok(noticeService.updateAuthor(authentication.getName(), id, request.name()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        noticeService.delete(authentication.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
