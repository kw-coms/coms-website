package com.coms.backend.controller;

import com.coms.backend.domain.ClubEventEntry;
import com.coms.backend.domain.ClubEventEntryFile;
import com.coms.backend.dto.ClubEventRequest;
import com.coms.backend.dto.ClubEventResponse;
import com.coms.backend.dto.ClubEventRsvpRequest;
import com.coms.backend.dto.ClubEventVoteRequest;
import com.coms.backend.service.AuditLogService;
import com.coms.backend.service.ClubEventService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
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
import com.coms.backend.web.ListPagination;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/club-events")
public class ClubEventController {

    private final ClubEventService clubEventService;
    private final AuditLogService auditLogService;

    public ClubEventController(ClubEventService clubEventService, AuditLogService auditLogService) {
        this.clubEventService = clubEventService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public ResponseEntity<List<ClubEventResponse>> list(Authentication authentication,
                                                        @RequestParam(required = false) Integer page,
                                                        @RequestParam(required = false) Integer size) {
        return ListPagination.paginate(clubEventService.list(authentication.getName()), page, size);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClubEventResponse> get(@PathVariable Long id, Authentication authentication) {
        return ResponseEntity.ok(clubEventService.get(id, authentication.getName()));
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PostMapping
    public ResponseEntity<ClubEventResponse> create(@Valid @RequestBody ClubEventRequest request,
                                                    Authentication authentication) {
        ClubEventResponse response = clubEventService.createEvent(
                request.title(), request.description(), request.startsAt(), request.endsAt(), authentication.getName());
        recordEventAudit(authentication, "ADMIN_CLUB_EVENT_CREATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PatchMapping("/{id}")
    public ResponseEntity<ClubEventResponse> update(@PathVariable Long id,
                                                    @Valid @RequestBody ClubEventRequest request,
                                                    Authentication authentication) {
        ClubEventResponse response = clubEventService.updateEvent(
                id, request.title(), request.description(), request.startsAt(), request.endsAt(), authentication.getName());
        recordEventAudit(authentication, "ADMIN_CLUB_EVENT_UPDATE", response);
        return ResponseEntity.ok(response);
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @PostMapping(path = "/{id}/entries", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ClubEventResponse.Entry> addEntry(@PathVariable Long id,
                                                            @RequestParam("title") String title,
                                                            @RequestParam(value = "authorName", required = false) String authorName,
                                                            @RequestParam(value = "description", required = false) String description,
                                                            @RequestParam(value = "workType", required = false) String workType,
                                                            @RequestParam(value = "summary", required = false) String summary,
                                                            @RequestParam(value = "tags", required = false) String tags,
                                                            @RequestParam(value = "externalUrl", required = false) String externalUrl,
                                                            @RequestParam(value = "files", required = false) List<MultipartFile> files,
                                                            @RequestParam(value = "file", required = false) MultipartFile legacyFile,
                                                            Authentication authentication) {
        List<MultipartFile> uploadFiles = files == null || files.isEmpty()
                ? (legacyFile == null ? List.of() : List.of(legacyFile))
                : files;
        ClubEventResponse.Entry response = clubEventService.addEntry(
                id, title, authorName, description, workType, summary, tags, externalUrl, uploadFiles, authentication.getName());
        recordEntryAudit(authentication, "ADMIN_CLUB_EVENT_ENTRY_CREATE", id, response);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/entries/{entryId}/vote")
    public ResponseEntity<ClubEventResponse> vote(@PathVariable Long id,
                                                  @PathVariable Long entryId,
                                                  @Valid @RequestBody(required = false) ClubEventVoteRequest request,
                                                  Authentication authentication) {
        Long requestedEntryId = request == null || request.entryId() == null ? entryId : request.entryId();
        return ResponseEntity.ok(clubEventService.vote(id, requestedEntryId, authentication.getName()));
    }

    @PostMapping("/{id}/rsvp")
    public ResponseEntity<ClubEventResponse> rsvp(@PathVariable Long id,
                                                  @Valid @RequestBody ClubEventRsvpRequest request,
                                                  Authentication authentication) {
        return ResponseEntity.ok(clubEventService.rsvp(id, authentication.getName(), request.status()));
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

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @DeleteMapping("/{id}/entries/{entryId}")
    public ResponseEntity<Void> deleteEntry(@PathVariable Long id,
                                            @PathVariable Long entryId,
                                            Authentication authentication) {
        ClubEventEntry entry = clubEventService.loadEntryMeta(id, entryId);
        clubEventService.deleteEntry(id, entryId);
        recordEntryAudit(authentication, "ADMIN_CLUB_EVENT_ENTRY_DELETE", id, entry);
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("@perm.has(authentication,'ACTIVITY_WRITE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(@PathVariable Long id, Authentication authentication) {
        ClubEventResponse event = clubEventService.get(id, authentication.getName());
        clubEventService.deleteEvent(id);
        recordEventAudit(authentication, "ADMIN_CLUB_EVENT_DELETE", event);
        return ResponseEntity.noContent().build();
    }

    private void recordEventAudit(Authentication authentication, String action, ClubEventResponse event) {
        auditLogService.record(
                authentication.getName(),
                action,
                "CLUB_EVENT",
                String.valueOf(event.id()),
                eventDetail(event),
                null
        );
    }

    private void recordEntryAudit(Authentication authentication,
                                  String action,
                                  Long eventId,
                                  ClubEventResponse.Entry entry) {
        auditLogService.record(
                authentication.getName(),
                action,
                "CLUB_EVENT_ENTRY",
                String.valueOf(entry.id()),
                entryDetail(eventId, entry),
                null
        );
    }

    private void recordEntryAudit(Authentication authentication,
                                  String action,
                                  Long eventId,
                                  ClubEventEntry entry) {
        auditLogService.record(
                authentication.getName(),
                action,
                "CLUB_EVENT_ENTRY",
                String.valueOf(entry.getId()),
                entryDetail(eventId, entry),
                null
        );
    }

    private String eventDetail(ClubEventResponse event) {
        StringBuilder detail = new StringBuilder();
        append(detail, "title", event.title());
        append(detail, "description", event.description());
        append(detail, "startsAt", event.startsAt());
        append(detail, "endsAt", event.endsAt());
        append(detail, "entryCount", event.entryCount());
        return detail.toString();
    }

    private String entryDetail(Long eventId, ClubEventResponse.Entry entry) {
        StringBuilder detail = new StringBuilder();
        append(detail, "eventId", eventId);
        append(detail, "title", entry.title());
        append(detail, "author", entry.authorName());
        append(detail, "workType", entry.workType());
        append(detail, "file", entry.originalName());
        return detail.toString();
    }

    private String entryDetail(Long eventId, ClubEventEntry entry) {
        StringBuilder detail = new StringBuilder();
        append(detail, "eventId", eventId);
        append(detail, "title", entry.getTitle());
        append(detail, "author", entry.getAuthorName());
        append(detail, "workType", entry.getWorkType());
        append(detail, "file", entry.getOriginalName());
        return detail.toString();
    }

    private void append(StringBuilder detail, String key, Object value) {
        if (value == null) {
            return;
        }
        if (!detail.isEmpty()) {
            detail.append('\n');
        }
        detail.append(key).append('=').append(value);
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
