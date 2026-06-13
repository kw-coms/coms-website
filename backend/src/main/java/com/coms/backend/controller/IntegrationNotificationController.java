package com.coms.backend.controller;

import com.coms.backend.domain.Notification;
import com.coms.backend.dto.IntegrationNotificationRequest;
import com.coms.backend.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/integrations/notifications")
public class IntegrationNotificationController {
    private final NotificationService notificationService;

    public IntegrationNotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping
    @PreAuthorize("hasRole('INTEGRATION')")
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody IntegrationNotificationRequest request) {
        Notification saved = notificationService.notifyExternalInvite(
                request.getRecipientStudentId(),
                request.getActorLabel(),
                request.getMessage(),
                request.getAcceptUrl(),
                request.isSendEmail()
        );
        return ResponseEntity.ok(Map.of(
                "id", saved.getId(),
                "recipientStudentId", saved.getRecipientStudentId(),
                "createdAt", saved.getCreatedAt()
        ));
    }
}
