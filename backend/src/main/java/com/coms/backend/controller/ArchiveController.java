package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.dto.ArchiveFileResponse;
import com.coms.backend.service.ArchiveService;
import com.coms.backend.service.StorageService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class ArchiveController {

    private final ArchiveService archiveService;
    private final StorageService storageService;

    public ArchiveController(ArchiveService archiveService, StorageService storageService) {
        this.archiveService = archiveService;
        this.storageService = storageService;
    }

    @PostMapping
    public ResponseEntity<ArchiveFileResponse> upload(@RequestParam("file") MultipartFile file,
                                                      Authentication authentication) throws IOException {
        return ResponseEntity.ok(archiveService.upload(file, authentication.getName()));
    }

    @GetMapping
    public ResponseEntity<List<ArchiveFileResponse>> list() {
        return ResponseEntity.ok(archiveService.list());
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        ArchiveFile file = archiveService.get(id);
        Resource resource = storageService.load(file.getStoredName());
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.getOriginalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(mediaType(file.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    private MediaType mediaType(String mimeType) {
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        archiveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
