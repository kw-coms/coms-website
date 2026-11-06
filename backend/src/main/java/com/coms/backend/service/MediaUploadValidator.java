package com.coms.backend.service;

import com.coms.backend.web.SafeMediaTypes;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Set;

/** Shared binary validation; image metadata removal remains in StorageService.storeImage. */
@Component
public class MediaUploadValidator {
    private static final long MB = 1024L * 1024;
    public static final int MAX_BODY_IMAGES = 20;
    public static final int MAX_BODY_VIDEOS = 3;
    public static final int MAX_BODY_FILES = 10;
    public static final int MAX_BODY_MEDIA_BLOCKS = 200;
    static final long MAX_IMAGE_BYTES = 5 * MB;
    static final long MAX_VIDEO_BYTES = 100 * MB;
    static final long MAX_FILE_BYTES = 50 * MB;
    private static final int PENDING_BODY_SLOTS = 2;
    public static final long MAX_PENDING_BYTES = PENDING_BODY_SLOTS * (MAX_BODY_IMAGES * MAX_IMAGE_BYTES
            + MAX_BODY_VIDEOS * MAX_VIDEO_BYTES + MAX_BODY_FILES * MAX_FILE_BYTES);
    public static final int MAX_PENDING_COUNT = PENDING_BODY_SLOTS * (MAX_BODY_IMAGES + MAX_BODY_VIDEOS + MAX_BODY_FILES);
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final Set<String> VIDEO_TYPES = Set.of("video/mp4", "video/webm", "video/quicktime");

    public String validateImage(MultipartFile file) {
        requireFile(file, MAX_IMAGE_BYTES, "이미지는 5MB 이하만 업로드할 수 있습니다.");
        String type = file.getContentType();
        if (type == null || !IMAGE_TYPES.contains(type)) {
            throw badRequest("JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.");
        }
        UploadSniffer.ImageType sniffed = UploadSniffer.imageType(UploadSniffer.header(file));
        if (sniffed == null || !sniffed.mimeType().equals(type)) {
            throw badRequest("이미지 파일 내용이 형식과 일치하지 않습니다.");
        }
        return type;
    }

    public String validateVideo(MultipartFile file) {
        requireFile(file, MAX_VIDEO_BYTES, "영상은 100MB 이하만 업로드할 수 있습니다.");
        String type = file.getContentType();
        if (type == null || !VIDEO_TYPES.contains(type)) {
            throw badRequest("MP4, WebM, MOV 영상만 업로드할 수 있습니다.");
        }
        if (!UploadSniffer.matchesVideoType(type, UploadSniffer.header(file))) {
            throw badRequest("영상 파일 내용이 형식과 일치하지 않습니다.");
        }
        return type;
    }

    public String validateFile(MultipartFile file) {
        requireFile(file, MAX_FILE_BYTES, "첨부파일은 50MB 이하만 업로드할 수 있습니다.");
        String extension = StringUtils.getFilenameExtension(cleanOriginalFilename(file));
        if (extension == null || !ArchiveService.ALLOWED_EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT))) {
            throw badRequest("허용되지 않는 자료실 파일 확장자입니다.");
        }
        if (!UploadSniffer.matchesExtension(extension, UploadSniffer.header(file))) {
            throw badRequest("파일 내용이 확장자와 일치하지 않습니다.");
        }
        // Files are always attachments; never persist a client-supplied active MIME type.
        var safeType = SafeMediaTypes.forDownload(file.getContentType());
        String baseType = safeType.getType() + "/" + safeType.getSubtype();
        return baseType.length() <= 100 ? baseType : "application/octet-stream";
    }

    public static String canonicalExtension(String validatedType) {
        return switch (validatedType) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            case "video/mp4" -> "mp4";
            case "video/webm" -> "webm";
            case "video/quicktime" -> "mov";
            default -> throw new IllegalArgumentException("Unsupported media type: " + validatedType);
        };
    }

    public static String cleanOriginalFilename(MultipartFile file) {
        String raw = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace('\\', '/');
        String filename = StringUtils.getFilename(raw);
        return StringUtils.cleanPath(filename == null ? "" : filename).replaceAll("[\\p{Cntrl}]", "");
    }

    private void requireFile(MultipartFile file, long maxBytes, String sizeMessage) {
        if (file == null || file.isEmpty() || cleanOriginalFilename(file).isBlank()) {
            throw badRequest("파일이 비어 있거나 파일명이 없습니다.");
        }
        if (file.getSize() > maxBytes) throw badRequest(sizeMessage);
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
