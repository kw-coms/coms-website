package com.coms.backend.controller;

import com.coms.backend.dto.NoticeRequest;
import com.coms.backend.dto.NoticeResponse;
import com.coms.backend.service.NoticeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<List<NoticeResponse>> list() {
        return ResponseEntity.ok(noticeService.list());
    }

    @GetMapping("/{id}")
    public ResponseEntity<NoticeResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(noticeService.get(id));
    }

    @PostMapping
    public ResponseEntity<NoticeResponse> create(@Valid @RequestBody NoticeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(noticeService.create(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoticeResponse> update(@PathVariable Long id,
                                                 @Valid @RequestBody NoticeRequest request) {
        return ResponseEntity.ok(noticeService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        noticeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
