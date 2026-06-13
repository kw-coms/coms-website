package com.coms.backend.controller;

import com.coms.backend.dto.MemberExternalInviteRequest;
import com.coms.backend.dto.NotificationResponse;
import com.coms.backend.dto.NotificationSummaryResponse;
import com.coms.backend.service.NotificationService;
import com.coms.backend.service.NotificationService.ExternalInviteBatchResult;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @PostMapping("/external-invite")
    public ResponseEntity<Map<String, Object>> sendExternalInvite(Authentication authentication,
                                                                  @Valid @RequestBody MemberExternalInviteRequest request) {
        ExternalInviteBatchResult result = notificationService.notifyExternalInviteFromMember(authentication.getName(), request);
        return ResponseEntity.ok(Map.of(
                "accepted", result.accepted(),
                "unknown", result.unknown(),
                "rejected", result.rejected()
        ));
    }
}
