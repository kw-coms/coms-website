package com.coms.backend.controller;

import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.dto.CommunityVoteRequest;
import com.coms.backend.domain.CommunityPost;
import com.coms.backend.service.CommunityService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

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

    @GetMapping("/{id}")
    public ResponseEntity<CommunityPostResponse> get(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(communityService.get(authentication.getName(), id));
    }

    @PostMapping
    public ResponseEntity<CommunityPostResponse> create(Authentication authentication,
                                                       @Valid @RequestBody CommunityPostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(communityService.create(authentication.getName(), request, null));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CommunityPostResponse> createWithImage(Authentication authentication,
                                                                 @RequestParam String title,
                                                                 @RequestParam String content,
                                                                 @RequestParam(value = "image", required = false) MultipartFile image) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(communityService.create(authentication.getName(), new CommunityPostRequest(title, content, false), image));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CommunityPostResponse> update(Authentication authentication,
                                                        @PathVariable Long id,
                                                        @Valid @RequestBody CommunityPostRequest request) {
        return ResponseEntity.ok(communityService.update(authentication.getName(), id, request, null));
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CommunityPostResponse> updateWithImage(Authentication authentication,
                                                                 @PathVariable Long id,
                                                                 @RequestParam String title,
                                                                 @RequestParam String content,
                                                                 @RequestParam(defaultValue = "false") boolean removeImage,
                                                                 @RequestParam(value = "image", required = false) MultipartFile image) {
        return ResponseEntity.ok(communityService.update(
                authentication.getName(),
                id,
                new CommunityPostRequest(title, content, removeImage),
                image
        ));
    }

    @PostMapping("/{id}/vote")
    public ResponseEntity<CommunityPostResponse> vote(Authentication authentication,
                                                      @PathVariable Long id,
                                                      @Valid @RequestBody CommunityVoteRequest request) {
        return ResponseEntity.ok(communityService.vote(authentication.getName(), id, request.value()));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<Resource> image(@PathVariable Long id) {
        CommunityPost post = communityService.imagePost(id);
        Resource resource = communityService.loadImage(id);
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(post.getImageOriginalName() == null ? "community-image" : post.getImageOriginalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(mediaType(post.getImageMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        communityService.delete(authentication.getName(), id);
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
