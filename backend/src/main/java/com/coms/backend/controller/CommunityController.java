package com.coms.backend.controller;

import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.service.CommunityService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/community/posts")
public class CommunityController {
    private final CommunityService communityService;

    public CommunityController(CommunityService communityService) {
        this.communityService = communityService;
    }

    @GetMapping
    public ResponseEntity<List<CommunityPostResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(communityService.list(authentication.getName()));
    }

    @PostMapping
    public ResponseEntity<CommunityPostResponse> create(Authentication authentication,
                                                       @Valid @RequestBody CommunityPostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(communityService.create(authentication.getName(), request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        communityService.delete(authentication.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
