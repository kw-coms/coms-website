package com.coms.backend.controller;

import com.coms.backend.dto.HackathonReviewRequest;
import com.coms.backend.security.ClientIpResolver;
import com.coms.backend.service.HackathonService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/hackathon")
public class HackathonController {
    private final HackathonService service;
    private final ClientIpResolver clientIpResolver;

    public HackathonController(HackathonService service, ClientIpResolver clientIpResolver) {
        this.service = service;
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
}
