package com.coms.backend.controller;

import com.coms.backend.dto.CommunityReputationResponse;
import com.coms.backend.service.CommunityService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CommunityReputationController {

    private final CommunityService communityService;

    public CommunityReputationController(CommunityService communityService) {
        this.communityService = communityService;
    }

    @GetMapping("/api/community/members/{studentId}/reputation")
    public ResponseEntity<CommunityReputationResponse> reputation(Authentication authentication,
                                                                  @PathVariable String studentId) {
        return ResponseEntity.ok(communityService.reputation(authentication.getName(), studentId));
    }
}
