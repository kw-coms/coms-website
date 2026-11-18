package com.coms.backend.controller;

import com.coms.backend.dto.HackathonReviewRequest;
import com.coms.backend.dto.HackathonEventResponse;
import com.coms.backend.dto.HackathonEventSummary;
import com.coms.backend.security.ClientIpResolver;
import com.coms.backend.service.HackathonEventService;
import com.coms.backend.service.HackathonService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/hackathon")
public class HackathonController {
    private final HackathonService service;
    private final HackathonEventService events;
    private final ClientIpResolver clientIpResolver;

    public HackathonController(HackathonService service, HackathonEventService events, ClientIpResolver clientIpResolver) {
        this.service = service;
        this.events = events;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping
    public Map<String, Boolean> status() {
        return Map.of("open", service.isOpen());
    }

    @PostMapping("/reviews")
    public ResponseEntity<Map<String, String>> submit(@RequestBody HackathonReviewRequest request,
                                                       HttpServletRequest servletRequest) {
        String projectId = service.submit(request, clientIpResolver.resolve(servletRequest));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("projectId", projectId));
    }

    @GetMapping("/events")
    public List<HackathonEventSummary> events() { return events.publicList(); }

    @GetMapping("/events/{eventId}")
    public HackathonEventResponse event(@PathVariable Long eventId) { return events.publicDetail(eventId); }

    @PostMapping("/events/{eventId}/reviews")
    public ResponseEntity<Map<String, String>> submitEvent(@PathVariable Long eventId,
            @RequestBody HackathonReviewRequest request, HttpServletRequest servletRequest) {
        String projectId = service.submit(eventId, request, clientIpResolver.resolve(servletRequest));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("projectId", projectId));
    }

    @GetMapping("/events/{eventId}/materials/{materialId}")
    public ResponseEntity<Resource> material(@PathVariable Long eventId, @PathVariable Long materialId) {
        return events.download(eventId, materialId, false);
    }

    @GetMapping("/events/{eventId}/materials/{materialId}/inline.pdf")
    public ResponseEntity<Resource> inlinePdf(@PathVariable Long eventId, @PathVariable Long materialId) {
        return events.download(eventId, materialId, true);
    }
}
