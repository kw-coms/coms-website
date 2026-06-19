package com.coms.backend.controller;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.dto.ClubActivityResponse;
import com.coms.backend.dto.EngagementVoteRequest;
import com.coms.backend.service.ClubActivityService;
import com.coms.backend.service.StorageService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/club-activities")
public class ClubActivityController {

    private final ClubActivityService clubActivityService;
    private final StorageService storageService;

    public ClubActivityController(ClubActivityService clubActivityService, StorageService storageService) {
        this.clubActivityService = clubActivityService;
        this.storageService = storageService;
    }

    @GetMapping
    public ResponseEntity<List<ClubActivityResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(clubActivityService.list(authentication.getName()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClubActivityResponse> get(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(clubActivityService.getAndIncrementView(id, authentication.getName()));
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<ClubActivityResponse> vote(Authentication authentication,
                                                     @PathVariable Long id,
                                                     @Valid @RequestBody EngagementVoteRequest request) {
        return ResponseEntity.ok(clubActivityService.vote(authentication.getName(), id, request.value()));
    }

    @PostMapping
    public ResponseEntity<ClubActivityResponse> create(
            @RequestParam("kind") String kind,
            @RequestParam(value = "category", defaultValue = "GENERAL") String category,
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam("eventDate") LocalDate eventDate,
            @RequestParam(value = "image", required = false) MultipartFile image,
            Authentication authentication) throws IOException {
        return ResponseEntity.ok(clubActivityService.create(kind, category, title, description, eventDate, image, authentication.getName()));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<Resource> image(@PathVariable Long id) {
        ClubActivity activity = clubActivityService.get(id);
        if (activity.getImageStoredName() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Resource resource = storageService.load(activity.getImageStoredName());
        return ResponseEntity.ok()
                .contentType(mediaType(activity.getImageMimeType()))
                .body(resource);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        clubActivityService.delete(id);
        return ResponseEntity.noContent().build();
    }

    private MediaType mediaType(String mimeType) {
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
