package com.coms.backend.controller;

import com.coms.backend.dto.EngagementVoteRequest;
import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.service.NoticeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/notices")
public class NoticeController {

    private final NoticeService noticeService;

    public NoticeController(NoticeService noticeService) {
        this.noticeService = noticeService;
    }

    @GetMapping
    public ResponseEntity<List<NoticeResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(noticeService.list(studentId(authentication)));
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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        noticeService.delete(authentication.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
