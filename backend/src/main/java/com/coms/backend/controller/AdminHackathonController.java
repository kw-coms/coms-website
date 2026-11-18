package com.coms.backend.controller;

import com.coms.backend.dto.HackathonReviewResponse;
import com.coms.backend.dto.HackathonScoresRequest;
import com.coms.backend.dto.HackathonSettingsRequest;
import com.coms.backend.service.HackathonService;
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

    public AdminHackathonController(HackathonService service) { this.service = service; }

    @GetMapping("/reviews")
    public List<HackathonReviewResponse> reviews() { return service.list(); }

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
}
