package com.coms.backend.service;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ArchiveFileResponse;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@Transactional
public class ArchiveService {

    private static final long MAX_ARCHIVE_FILE_BYTES = 20L * 1024 * 1024;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "pdf", "txt", "md", "csv",
            "doc", "docx", "ppt", "pptx", "xls", "xlsx", "hwp", "hwpx",
            "zip", "jpg", "jpeg", "png", "gif", "webp"
    );
    private static final Set<String> BLOCKED_MIME_TYPES = Set.of(
            "text/html",
            "image/svg+xml",
            "application/javascript",
            "text/javascript",
            "application/x-msdownload",
            "application/x-sh",
            "application/x-csh"
    );

    private final ArchiveFileRepository repo;
    private final StorageService storage;
    private final MemberRepository memberRepository;

    public ArchiveService(ArchiveFileRepository repo, StorageService storage, MemberRepository memberRepository) {
        this.repo = repo;
        this.storage = storage;
        this.memberRepository = memberRepository;
    }

    public ArchiveFileResponse upload(String title, String description, MultipartFile file, String uploaderStudentId) throws IOException {
        validateUpload(file);
        String stored = storage.store(file);
        try {
            Member member = memberRepository.findByStudentId(uploaderStudentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            ArchiveFile entity = new ArchiveFile();
            entity.setTitle(title != null && !title.isBlank() ? title.trim() : cleanOriginalFilename(file));
            entity.setDescription(description != null && !description.isBlank() ? description.trim() : null);
            entity.setOriginalName(cleanOriginalFilename(file));
            entity.setStoredName(stored);
            entity.setMimeType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            entity.setFileSize(file.getSize());
            entity.setUploadedBy(uploaderStudentId);
            entity.setUploaderName(member.getName());
            return toResponse(repo.save(entity));
        } catch (RuntimeException e) {
            storage.delete(stored);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public List<ArchiveFileResponse> list() {
        return repo.findAllByOrderByUploadedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ArchiveFile get(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public void delete(Long id) {
        ArchiveFile file = get(id);
        storage.delete(file.getStoredName());
        repo.delete(file);
    }

    private ArchiveFileResponse toResponse(ArchiveFile file) {
        return new ArchiveFileResponse(
                file.getId(),
                file.getTitle() != null ? file.getTitle() : file.getOriginalName(),
                file.getDescription(),
                file.getOriginalName(),
                file.getMimeType(),
                file.getFileSize(),
                file.getUploadedBy(),
                file.getUploaderName(),
                file.getUploadedAt()
        );
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        return StringUtils.cleanPath(filename == null ? "" : filename);
    }

    private void validateUpload(MultipartFile file) {
        String filename = cleanOriginalFilename(file);
        if (file.isEmpty() || filename.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일이 비어 있거나 파일명이 없습니다.");
        }
        if (file.getSize() > MAX_ARCHIVE_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자료실 파일은 20MB 이하만 업로드할 수 있습니다.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (BLOCKED_MIME_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보안상 허용되지 않는 파일 형식입니다.");
        }
        String extension = StringUtils.getFilenameExtension(filename);
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 자료실 파일 확장자입니다.");
        }
    }
}
