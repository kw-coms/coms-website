package com.coms.backend.controller;

import com.coms.backend.dto.HackathonReviewResponse;
import com.coms.backend.dto.HackathonScoresRequest;
import com.coms.backend.dto.HackathonSettingsRequest;
import com.coms.backend.dto.HackathonEventWrite;
import com.coms.backend.dto.HackathonProjectWrite;
import com.coms.backend.dto.HackathonPublicationRequest;
import com.coms.backend.dto.HackathonResultsRequest;
import com.coms.backend.dto.AdminHackathonEventSummary;
import com.coms.backend.dto.AdminHackathonEventResponse;
import com.coms.backend.dto.HackathonProjectResponse;
import com.coms.backend.dto.HackathonMaterialResponse;
import com.coms.backend.dto.HackathonEventReviewResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import com.coms.backend.service.HackathonService;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.HackathonEventService;
import com.coms.backend.domain.HackathonReview;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/hackathon")
public class AdminHackathonController {
    private final HackathonService service;
    private final HackathonEventService events;
    private final AuditLogService auditLogService;

    public AdminHackathonController(HackathonService service, HackathonEventService events, AuditLogService auditLogService) {
        this.service = service;
        this.events = events;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/reviews")
    public List<HackathonReviewResponse> reviews() { return service.list(); }

    @DeleteMapping("/reviews/{id}")
    @ApiResponse(responseCode = "204", description = "평가 삭제")
    public ResponseEntity<Void> deleteReview(@PathVariable Long id, Authentication authentication) {
        service.deleteReview(id);
        auditLogService.record(authentication.getName(), "ADMIN_HACKATHON_REVIEW_DELETE",
                "HACKATHON_REVIEW", String.valueOf(id), null, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/settings")
    public Map<String, Boolean> settings() { return Map.of("open", service.isOpen()); }

    @PutMapping("/settings")
    public Map<String, Boolean> settings(@RequestBody HackathonSettingsRequest request) {
        return Map.of("open", service.setOpen(request == null ? null : request.open()));
    }

    @PutMapping("/chair-reviews/{projectId}")
    public HackathonReviewResponse chair(@PathVariable String projectId, @RequestBody HackathonScoresRequest request) {
        return service.saveChair(projectId, request);
    }

    @GetMapping("/events")
    public List<AdminHackathonEventSummary> events() { return events.adminList(); }

    @GetMapping("/events/{eventId}")
    public AdminHackathonEventResponse event(@PathVariable Long eventId) { return events.adminDetail(eventId); }

    @PostMapping("/events")
    public ResponseEntity<AdminHackathonEventResponse> create(@RequestBody HackathonEventWrite request, Authentication authentication) {
        AdminHackathonEventResponse created = events.create(request);
        audit(authentication, "ADMIN_HACKATHON_EVENT_CREATE", "HACKATHON_EVENT", created.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/events/{eventId}")
    public AdminHackathonEventResponse update(@PathVariable Long eventId, @RequestBody HackathonEventWrite request,
                                               Authentication authentication) {
        AdminHackathonEventResponse updated = events.update(eventId, request);
        audit(authentication, "ADMIN_HACKATHON_EVENT_UPDATE", "HACKATHON_EVENT", eventId);
        return updated;
    }

    @PutMapping("/events/{eventId}/published")
    public Map<String, Boolean> publish(@PathVariable Long eventId, @RequestBody HackathonPublicationRequest request,
                                         Authentication authentication) {
        boolean published = events.publish(eventId, request == null ? null : request.published());
        audit(authentication, "ADMIN_HACKATHON_EVENT_PUBLISH", "HACKATHON_EVENT", eventId);
        return Map.of("published", published);
    }

    @PutMapping("/events/{eventId}/results-published")
    public Map<String, Boolean> resultsPublished(@PathVariable Long eventId, @RequestBody HackathonResultsRequest request,
                                                  Authentication authentication) {
        boolean value = events.setResultsPublished(eventId, request == null ? null : request.resultsPublished());
        audit(authentication, "ADMIN_HACKATHON_EVENT_RESULTS", "HACKATHON_EVENT", eventId);
        return Map.of("resultsPublished", value);
    }

    @PutMapping("/events/{eventId}/settings")
    public Map<String, Boolean> eventSettings(@PathVariable Long eventId, @RequestBody HackathonSettingsRequest request,
                                               Authentication authentication) {
        boolean open = service.setOpen(eventId, request == null ? null : request.open());
        audit(authentication, "ADMIN_HACKATHON_EVENT_OPEN", "HACKATHON_EVENT", eventId);
        return Map.of("open", open);
    }

    @PostMapping("/events/{eventId}/projects")
    public ResponseEntity<HackathonProjectResponse> createProject(@PathVariable Long eventId, @RequestBody HackathonProjectWrite request,
                                                                   Authentication authentication) {
        HackathonProjectResponse created = events.createProject(eventId, request);
        audit(authentication, "ADMIN_HACKATHON_PROJECT_CREATE", "HACKATHON_PROJECT", created.projectId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/events/{eventId}/projects/{projectId}")
    public HackathonProjectResponse updateProject(@PathVariable Long eventId, @PathVariable String projectId,
                                                   @RequestBody HackathonProjectWrite request, Authentication authentication) {
        HackathonProjectResponse updated = events.updateProject(eventId, projectId, request);
        audit(authentication, "ADMIN_HACKATHON_PROJECT_UPDATE", "HACKATHON_PROJECT", projectId);
        return updated;
    }

    @DeleteMapping("/events/{eventId}/projects/{projectId}")
    public ResponseEntity<Void> deleteProject(@PathVariable Long eventId, @PathVariable String projectId,
                                               Authentication authentication) {
        events.deleteProject(eventId, projectId);
        audit(authentication, "ADMIN_HACKATHON_PROJECT_DELETE", "HACKATHON_PROJECT", projectId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/events/{eventId}/materials", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<HackathonMaterialResponse> upload(@PathVariable Long eventId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) String projectId,
            @RequestParam(required = false) String kind,
            @RequestParam(required = false) String label, Authentication authentication) {
        HackathonMaterialResponse uploaded = events.upload(eventId, projectId, kind, label, file);
        audit(authentication, "ADMIN_HACKATHON_MATERIAL_UPLOAD", "HACKATHON_MATERIAL", uploaded.id());
        return ResponseEntity.status(HttpStatus.CREATED).body(uploaded);
    }

    @DeleteMapping("/events/{eventId}/materials/{materialId}")
    public ResponseEntity<Void> deleteMaterial(@PathVariable Long eventId, @PathVariable Long materialId,
                                                Authentication authentication) {
        events.deleteMaterial(eventId, materialId);
        audit(authentication, "ADMIN_HACKATHON_MATERIAL_DELETE", "HACKATHON_MATERIAL", materialId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/events/{eventId}/reviews")
    public List<HackathonEventReviewResponse> eventReviews(@PathVariable Long eventId) { return service.listEvent(eventId); }

    @DeleteMapping("/events/{eventId}/reviews/{reviewId}")
    public ResponseEntity<Void> deleteEventReview(@PathVariable Long eventId, @PathVariable Long reviewId,
                                                   Authentication authentication) {
        service.deleteReview(eventId, reviewId);
        auditLogService.record(authentication.getName(), "ADMIN_HACKATHON_REVIEW_DELETE",
                "HACKATHON_REVIEW", String.valueOf(reviewId), null, null);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/events/{eventId}/chair-reviews/{projectId}")
    public HackathonEventReviewResponse eventChair(@PathVariable Long eventId, @PathVariable String projectId,
                                                    @RequestBody HackathonScoresRequest request, Authentication authentication) {
        HackathonReviewResponse saved = service.saveChair(eventId, projectId, request);
        audit(authentication, "ADMIN_HACKATHON_CHAIR_REVIEW_SAVE", "HACKATHON_REVIEW", saved.id());
        return service.listEvent(eventId).stream().filter(review -> review.id().equals(saved.id())).findFirst().orElseThrow();
    }

    private void audit(Authentication authentication, String action, String target, Object id) {
        auditLogService.record(authentication.getName(), action, target, String.valueOf(id), null, null);
    }
}
