package com.coms.backend.controller;

import com.coms.backend.dto.MiniAppDocumentRequest;
import com.coms.backend.dto.MiniAppDocumentResponse;
import com.coms.backend.service.MiniAppDocumentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/mini-apps/{app}")
public class MiniAppDocumentController {
    private final MiniAppDocumentService service;

    public MiniAppDocumentController(MiniAppDocumentService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public ResponseEntity<List<MiniAppDocumentResponse>> listProfileDocuments(
            Authentication authentication,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            @PathVariable String app) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.listProfileDocuments(authentication.getName(), app));
    }

    @PutMapping("/profile/{contentType}/{contentId}")
    public ResponseEntity<MiniAppDocumentResponse> saveProfileDocument(
            Authentication authentication,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            @PathVariable String app,
            @PathVariable String contentType,
            @PathVariable String contentId,
            @Valid @RequestBody MiniAppDocumentRequest request) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.saveProfileDocument(authentication.getName(), app, contentType, contentId, request));
    }

    @PostMapping("/profile/{contentType}/{contentId}/share")
    public ResponseEntity<MiniAppDocumentResponse> shareProfileDocument(
            Authentication authentication,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            @PathVariable String app,
            @PathVariable String contentType,
            @PathVariable String contentId) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.shareDocument(authentication.getName(), app, contentType, contentId));
    }

    @PostMapping("/profile/{contentType}/{contentId}/unshare")
    public ResponseEntity<MiniAppDocumentResponse> unshareProfileDocument(
            Authentication authentication,
            @RequestHeader(value = "X-Requested-With", required = false) String requestedWith,
            @PathVariable String app,
            @PathVariable String contentType,
            @PathVariable String contentId) {
        requireXmlHttpRequest(requestedWith);
        return ResponseEntity.ok(service.unshareDocument(authentication.getName(), app, contentType, contentId));
    }

    @GetMapping("/shared")
    public ResponseEntity<List<MiniAppDocumentResponse>> listSharedDocuments(@PathVariable String app) {
        return ResponseEntity.ok(service.listSharedDocuments(app));
    }

    @GetMapping("/shared/{shareSlug}")
    public ResponseEntity<MiniAppDocumentResponse> getSharedDocument(@PathVariable String app, @PathVariable String shareSlug) {
        return ResponseEntity.ok(service.getSharedDocument(app, shareSlug));
    }

    private void requireXmlHttpRequest(String requestedWith) {
        if (requestedWith == null || !"XMLHttpRequest".equalsIgnoreCase(requestedWith)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }
}
