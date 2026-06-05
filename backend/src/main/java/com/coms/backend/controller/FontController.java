package com.coms.backend.controller;

import com.coms.backend.domain.SiteFont;
import com.coms.backend.dto.FontActiveRequest;
import com.coms.backend.dto.SiteFontResponse;
import com.coms.backend.service.FontService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
public class FontController {
    private final FontService fontService;

    public FontController(FontService fontService) {
        this.fontService = fontService;
    }

    @GetMapping("/fonts")
    public ResponseEntity<List<SiteFontResponse>> activeFonts() {
        return ResponseEntity.ok(fontService.activeFonts());
    }

    @GetMapping("/fonts/{id}/file")
    public ResponseEntity<Resource> fontFile(@PathVariable Long id) {
        SiteFont font = fontService.font(id);
        Resource resource = fontService.load(id);
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(font.getOriginalName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(mediaType(font.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(resource);
    }

    @GetMapping("/admin/fonts")
    public ResponseEntity<List<SiteFontResponse>> adminFonts() {
        return ResponseEntity.ok(fontService.adminFonts());
    }

    @PostMapping(path = "/admin/fonts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SiteFontResponse> upload(@RequestParam String name,
                                                   @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(fontService.upload(name, file));
    }

    @PatchMapping("/admin/fonts/{id}/active")
    public ResponseEntity<SiteFontResponse> setActive(@PathVariable Long id,
                                                      @Valid @RequestBody FontActiveRequest request) {
        return ResponseEntity.ok(fontService.setActive(id, request.active()));
    }

    private MediaType mediaType(String mimeType) {
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
