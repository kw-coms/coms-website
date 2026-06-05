package com.coms.backend.controller;

import com.coms.backend.dto.NotificationResponse;
import com.coms.backend.dto.NotificationSummaryResponse;
import com.coms.backend.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ResponseEntity<List<NotificationResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(notificationService.list(authentication.getName()));
    }

    @GetMapping("/summary")
    public ResponseEntity<NotificationSummaryResponse> summary(Authentication authentication) {
        return ResponseEntity.ok(notificationService.summary(authentication.getName()));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<NotificationResponse> markRead(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(notificationService.markRead(authentication.getName(), id));
    }

    @PatchMapping("/read-all")
    public ResponseEntity<Void> markAllRead(Authentication authentication) {
        notificationService.markAllRead(authentication.getName());
        return ResponseEntity.noContent().build();
    }
}
