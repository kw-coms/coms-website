package com.coms.backend.controller;

import com.coms.backend.dto.AskRequest;
import com.coms.backend.security.ClientIpResolver;
import com.coms.backend.service.AskService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AskController {
    private final AskService askService;
    private final ClientIpResolver clientIpResolver;

    public AskController(AskService askService, ClientIpResolver clientIpResolver) {
        this.askService = askService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/api/ask")
    public ResponseEntity<Void> ask(@RequestBody AskRequest request, Authentication authentication,
                                    HttpServletRequest servletRequest) {
        askService.send(request, authentication, clientIpResolver.resolve(servletRequest));
        return ResponseEntity.noContent().build();
    }
}
