package com.coms.backend.controller;

import com.coms.backend.dto.GatheringDetailResponse;
import com.coms.backend.dto.GatheringJoinRequest;
import com.coms.backend.dto.GatheringRequest;
import com.coms.backend.dto.GatheringResponse;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.GatheringService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Gatherings ("모임 신청"). Every route needs a signed-in member: the security configuration
 * ends in authenticated() for anything not listed there, and nothing here is listed. Closing
 * or deleting a gathering and taking someone else's name off it are for the member who opened
 * it and the president; the service decides.
 */
@RestController
@RequestMapping("/api/gatherings")
public class GatheringController {
    private final GatheringService gatheringService;
    private final AuditLogService auditLogService;

    public GatheringController(GatheringService gatheringService, AuditLogService auditLogService) {
        this.gatheringService = gatheringService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public ResponseEntity<List<GatheringResponse>> listGatherings(Authentication authentication) {
        return ResponseEntity.ok(gatheringService.list(authentication.getName()));
    }

    @PostMapping
    public ResponseEntity<GatheringDetailResponse> createGathering(@Valid @RequestBody GatheringRequest request,
                                                                   Authentication authentication) {
        GatheringDetailResponse response = gatheringService.create(request, authentication.getName());
        audit(authentication, "GATHERING_CREATE", response.gathering().id(),
                "title=" + auditValue(response.gathering().title()) + ", capacity=" + auditValue(response.gathering().capacity()));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<GatheringDetailResponse> getGathering(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(gatheringService.get(id, authentication.getName()));
    }

    @PostMapping("/{id}/signups")
    public ResponseEntity<GatheringDetailResponse> joinGathering(@PathVariable Long id,
                                                                 @Valid @RequestBody GatheringJoinRequest request,
                                                                 Authentication authentication) {
        return ResponseEntity.ok(gatheringService.join(id, authentication.getName(), request.note()));
    }

    @DeleteMapping("/{id}/signups/me")
    public ResponseEntity<GatheringDetailResponse> leaveGathering(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(gatheringService.leave(id, authentication.getName()));
    }

    @DeleteMapping("/{id}/signups/{signupId}")
    public ResponseEntity<GatheringDetailResponse> removeGatheringSignup(@PathVariable Long id,
                                                                         @PathVariable Long signupId,
                                                                         Authentication authentication) {
        GatheringDetailResponse response = gatheringService.removeSignup(id, signupId, authentication.getName());
        audit(authentication, "GATHERING_SIGNUP_REMOVE", id,
                "title=" + auditValue(response.gathering().title()) + ", signupId=" + signupId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<GatheringDetailResponse> closeGathering(@PathVariable Long id, Authentication authentication) {
        GatheringDetailResponse response = gatheringService.close(id, authentication.getName());
        audit(authentication, "GATHERING_CLOSE", id,
                "title=" + auditValue(response.gathering().title()) + ", participants=" + response.gathering().participantCount());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteGathering(@PathVariable Long id, Authentication authentication) {
        GatheringDetailResponse before = gatheringService.get(id, authentication.getName());
        gatheringService.delete(id, authentication.getName());
        audit(authentication, "GATHERING_DELETE", id,
                "title=" + auditValue(before.gathering().title()) + ", participants=" + before.gathering().participantCount());
        return ResponseEntity.noContent().build();
    }

    private void audit(Authentication authentication, String action, Long gatheringId, String detail) {
        auditLogService.record(authentication.getName(), action, "GATHERING", String.valueOf(gatheringId), detail, null);
    }

    private String auditValue(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > 160 ? text.substring(0, 160) : text;
    }
}
