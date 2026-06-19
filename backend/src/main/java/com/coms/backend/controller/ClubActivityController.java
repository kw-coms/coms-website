package com.coms.backend.controller;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.domain.ClubActivityFile;
import com.coms.backend.domain.ClubActivityImage;
import com.coms.backend.dto.ClubActivityResponse;
import com.coms.backend.dto.EngagementVoteRequest;
import com.coms.backend.service.ClubActivityService;
import com.coms.backend.service.StorageService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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

    @PatchMapping("/{id}")
    public ResponseEntity<ClubActivityResponse> update(
            @PathVariable Long id,
            @RequestParam(value = "kind", required = false) String kind,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "eventDate", required = false) LocalDate eventDate,
            Authentication authentication) {
        return ResponseEntity.ok(clubActivityService.update(id, kind, category, title, description, eventDate, authentication.getName()));
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

    @PostMapping(path = "/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<Long>> uploadImages(@PathVariable Long id,
                                                   @RequestParam("images") List<MultipartFile> images) {
        return ResponseEntity.status(HttpStatus.CREATED).body(clubActivityService.addImages(id, images));
    }

    @GetMapping("/{id}/images/{imageId}")
    public ResponseEntity<Resource> getImage(@PathVariable Long id, @PathVariable Long imageId) {
        ClubActivityImage meta = clubActivityService.loadImageMeta(id, imageId);
        Resource resource = clubActivityService.loadImageResource(id, imageId);
        String filename = meta.getOriginalName() == null ? "activity-image" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/images/{imageId}")
    public ResponseEntity<Void> deleteImage(@PathVariable Long id, @PathVariable Long imageId) {
        clubActivityService.deleteImage(id, imageId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(path = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Long> uploadFile(@PathVariable Long id,
                                           @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(clubActivityService.addFile(id, file));
    }

    @GetMapping("/{id}/files/{fileId}/download")
    public ResponseEntity<Resource> downloadFile(@PathVariable Long id, @PathVariable Long fileId) {
        ClubActivityFile meta = clubActivityService.loadFileMeta(id, fileId);
        Resource resource = clubActivityService.loadFileResource(id, fileId);
        String filename = meta.getOriginalName() == null || meta.getOriginalName().isBlank() ? "attachment" : meta.getOriginalName();
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/files/{fileId}")
    public ResponseEntity<Void> deleteFile(@PathVariable Long id, @PathVariable Long fileId) {
        clubActivityService.deleteFile(id, fileId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        clubActivityService.delete(id);
        return ResponseEntity.noContent().build();
    }

    private MediaType mediaType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
