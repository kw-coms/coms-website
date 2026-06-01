package com.coms.backend.service;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.dto.ArchiveFileResponse;
import com.coms.backend.repository.ArchiveFileRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@Service
@Transactional
public class ArchiveService {

    private final ArchiveFileRepository repo;
    private final StorageService storage;

    public ArchiveService(ArchiveFileRepository repo, StorageService storage) {
        this.repo = repo;
        this.storage = storage;
    }

    public ArchiveFileResponse upload(MultipartFile file, String uploaderStudentId) throws IOException {
        String stored = storage.store(file);
        try {
            ArchiveFile entity = new ArchiveFile();
            entity.setOriginalName(cleanOriginalFilename(file));
            entity.setStoredName(stored);
            entity.setMimeType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            entity.setFileSize(file.getSize());
            entity.setUploadedBy(uploaderStudentId);
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
                file.getOriginalName(),
                file.getMimeType(),
                file.getFileSize(),
                file.getUploadedBy(),
                file.getUploadedAt()
        );
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        return StringUtils.cleanPath(filename == null ? "" : filename);
    }
}
