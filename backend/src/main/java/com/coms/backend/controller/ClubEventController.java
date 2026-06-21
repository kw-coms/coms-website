package com.coms.backend.controller;

import com.coms.backend.domain.ClubEventEntry;
import com.coms.backend.domain.ClubEventEntryFile;
import com.coms.backend.dto.ClubEventRequest;
import com.coms.backend.dto.ClubEventResponse;
import com.coms.backend.dto.ClubEventVoteRequest;
import com.coms.backend.service.ClubEventService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
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

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/club-events")
public class ClubEventController {

    private final ClubEventService clubEventService;

    public ClubEventController(ClubEventService clubEventService) {
        this.clubEventService = clubEventService;
    }

    @GetMapping
    public ResponseEntity<List<ClubEventResponse>> list(Authentication authentication) {
        return ResponseEntity.ok(clubEventService.list(authentication.getName()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClubEventResponse> get(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(clubEventService.get(id, authentication.getName()));
    }

    @PostMapping
    public ResponseEntity<ClubEventResponse> create(@Valid @RequestBody ClubEventRequest request,
                                                    Authentication authentication) {
        return ResponseEntity.ok(clubEventService.createEvent(
                request.title(), request.description(), request.startsAt(), request.endsAt(), authentication.getName()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ClubEventResponse> update(@PathVariable Long id,
                                                    @Valid @RequestBody ClubEventRequest request,
                                                    Authentication authentication) {
        return ResponseEntity.ok(clubEventService.updateEvent(
                id, request.title(), request.description(), request.startsAt(), request.endsAt(), authentication.getName()));
    }

    @PostMapping(path = "/{id}/entries", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ClubEventResponse.Entry> addEntry(@PathVariable Long id,
                                                            @RequestParam("title") String title,
                                                            @RequestParam(value = "authorName", required = false) String authorName,
                                                            @RequestParam(value = "description", required = false) String description,
                                                            @RequestParam(value = "files", required = false) List<MultipartFile> files,
                                                            @RequestParam(value = "file", required = false) MultipartFile legacyFile,
                                                            Authentication authentication) {
        List<MultipartFile> uploadFiles = files == null || files.isEmpty()
                ? (legacyFile == null ? List.of() : List.of(legacyFile))
                : files;
        return ResponseEntity.ok(clubEventService.addEntry(id, title, authorName, description, uploadFiles, authentication.getName()));
    }

    @PostMapping("/{id}/entries/{entryId}/vote")
    public ResponseEntity<ClubEventResponse> vote(@PathVariable Long id,
                                                  @PathVariable Long entryId,
                                                  @Valid @RequestBody(required = false) ClubEventVoteRequest request,
                                                  Authentication authentication) {
        Long requestedEntryId = request == null || request.entryId() == null ? entryId : request.entryId();
        return ResponseEntity.ok(clubEventService.vote(id, requestedEntryId, authentication.getName()));
    }

    @GetMapping("/{id}/entries/{entryId}/download")
    public ResponseEntity<Resource> downloadEntry(@PathVariable Long id, @PathVariable Long entryId) {
        ClubEventEntry meta = clubEventService.loadEntryMeta(id, entryId);
        Resource resource = clubEventService.loadEntryResource(id, entryId);
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(meta.getOriginalName(), StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @GetMapping("/{id}/entries/{entryId}/files/{fileId}/download")
    public ResponseEntity<Resource> downloadEntryFile(@PathVariable Long id,
                                                      @PathVariable Long entryId,
                                                      @PathVariable Long fileId) {
        ClubEventEntryFile meta = clubEventService.loadEntryFileMeta(id, entryId, fileId);
        Resource resource = clubEventService.loadEntryFileResource(id, entryId, fileId);
        return ResponseEntity.ok()
                .contentType(mediaType(meta.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(meta.getOriginalName(), StandardCharsets.UTF_8).build().toString())
                .body(resource);
    }

    @DeleteMapping("/{id}/entries/{entryId}")
    public ResponseEntity<Void> deleteEntry(@PathVariable Long id, @PathVariable Long entryId) {
        clubEventService.deleteEntry(id, entryId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(@PathVariable Long id) {
        clubEventService.deleteEvent(id);
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
