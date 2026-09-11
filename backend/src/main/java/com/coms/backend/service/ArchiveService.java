package com.coms.backend.service;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.domain.ArchiveFileVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ArchiveFileResponse;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.ArchiveFileVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class ArchiveService {
    private static final Logger log = LoggerFactory.getLogger(ArchiveService.class);

    // A real cap for this feature (lecture notes, slides, past papers). Matching the
    // multipart cap made this check meaningless — the container rejected first.
    private static final long MAX_ARCHIVE_FILE_BYTES = 50L * 1024 * 1024;
    private static final int MAX_TITLE_LENGTH = 200;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "pdf", "txt", "md", "csv",
            "doc", "docx", "ppt", "pptx", "xls", "xlsx", "hwp", "hwpx",
            "zip", "jpg", "jpeg", "png", "gif", "webp",
            "mp4", "mov", "avi", "mkv", "webm", "m4v"
    );
    private static final Set<String> BLOCKED_MIME_TYPES = Set.of(
            "text/html",
            "application/xhtml+xml",
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
    private final ArchiveFileVoteRepository voteRepository;
    private final RichContentSanitizer richContentSanitizer;
    private final AuditLogService auditLogService;

    public ArchiveService(ArchiveFileRepository repo, StorageService storage, MemberRepository memberRepository,
                          ArchiveFileVoteRepository voteRepository, RichContentSanitizer richContentSanitizer,
                          AuditLogService auditLogService) {
        this.repo = repo;
        this.storage = storage;
        this.memberRepository = memberRepository;
        this.voteRepository = voteRepository;
        this.richContentSanitizer = richContentSanitizer;
        this.auditLogService = auditLogService;
    }

    public ArchiveFileResponse upload(String title, String description, MultipartFile file, String uploaderStudentId) throws IOException {
        return upload(title, description, null, file, uploaderStudentId);
    }

    public ArchiveFileResponse upload(String title, String description, String category, MultipartFile file, String uploaderStudentId) throws IOException {
        ArchiveFile.Category parsedCategory = parseCategory(category);
        validateUpload(file);
        String stored = storage.store(file);
        try {
            Member member = memberRepository.findByStudentId(uploaderStudentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            ArchiveFile entity = new ArchiveFile();
            entity.setTitle(title != null && !title.isBlank() ? title.trim() : cleanOriginalFilename(file));
            entity.setDescription(sanitizeDescription(description));
            entity.setCategory(parsedCategory);
            entity.setOriginalName(cleanOriginalFilename(file));
            entity.setStoredName(stored);
            entity.setMimeType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            entity.setFileSize(file.getSize());
            entity.setUploadedBy(uploaderStudentId);
            entity.setUploaderName(member.getName());
            ArchiveFile saved = repo.save(entity);
            return toResponse(saved, voteStats(List.of(saved)), uploaderStudentId);
        } catch (RuntimeException e) {
            storage.delete(stored);
            throw e;
        }
    }

    public ArchiveFileResponse update(String editorStudentId, Long id, String title, String description,
                                      String category, MultipartFile replacement) throws IOException {
        Member editor = memberRepository.findByStudentId(editorStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        ArchiveFile entity = repo.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!Objects.equals(entity.getUploadedBy(), editor.getStudentId()) && editor.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        ArchiveFile.Category parsedCategory = parseCategory(category);
        String normalizedTitle = normalizeTitle(title);
        String oldStoredName = entity.getStoredName();
        String newStoredName = null;
        if (replacement != null && replacement.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "교체할 파일이 비어 있습니다.");
        }
        if (replacement != null) {
            validateUpload(replacement);
            newStoredName = storage.store(replacement);
            deleteAfterRollback(newStoredName);
            entity.setOriginalName(cleanOriginalFilename(replacement));
            entity.setStoredName(newStoredName);
            entity.setMimeType(replacement.getContentType() == null ? "application/octet-stream" : replacement.getContentType());
            entity.setFileSize(replacement.getSize());
        }
        entity.setTitle(normalizedTitle != null ? normalizedTitle : entity.getOriginalName());
        entity.setDescription(sanitizeDescription(description));
        entity.setCategory(parsedCategory);
        ArchiveFile saved = repo.save(entity);
        if (newStoredName != null && !Objects.equals(oldStoredName, newStoredName)) {
            deleteAfterCommit(oldStoredName);
        }
        auditLogService.record(editor.getStudentId(), "ARCHIVE_FILE_UPDATE", "ARCHIVE_FILE",
                String.valueOf(saved.getId()), archiveAuditDetail(saved, newStoredName != null), null);
        return toResponse(saved, voteStats(List.of(saved)), editorStudentId);
    }

    /**
     * Display-name mode remains the archive.manage-compatible path enforced by the controller.
     * Supplying studentId is ownership reassignment and is always ADMIN-only in the service.
     */
    @PreAuthorize("@perm.has(authentication,'ARCHIVE_MANAGE')")
    public ArchiveFileResponse updateAuthor(Long id, String uploaderName, String studentId, String editorStudentId) {
        ArchiveFile entity = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String cleaned = uploaderName == null ? "" : uploaderName.trim();
        String cleanedStudentId = studentId == null ? "" : studentId.trim();
        if (cleaned.isEmpty() == cleanedStudentId.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "회원 선택 또는 이름 직접 입력 중 하나만 지정해주세요.");
        }
        String detail;
        if (!cleanedStudentId.isEmpty()) {
            Member editor = memberRepository.findByStudentId(editorStudentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            if (editor.getRole() != Member.Role.ADMIN) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            }
            Member newOwner = memberRepository.findByStudentId(cleanedStudentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "해당 학번의 회원을 찾을 수 없습니다."));
            entity.setUploadedBy(newOwner.getStudentId());
            entity.setUploaderName(newOwner.getName());
            detail = "uploadedBy=" + newOwner.getStudentId();
        } else {
            if (cleaned.length() > 60) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "작성자 이름은 60자 이하여야 합니다.");
            }
            entity.setUploaderName(cleaned);
            detail = "uploaderName=(custom)";
        }
        ArchiveFile saved = repo.save(entity);
        auditLogService.record(editorStudentId, "ARCHIVE_FILE_AUTHOR_UPDATE", "ARCHIVE_FILE",
                String.valueOf(saved.getId()), detail, null);
        return toResponse(saved, voteStats(List.of(saved)), editorStudentId);
    }

    @PreAuthorize("@perm.has(authentication,'ARCHIVE_MANAGE')")
    public ArchiveFileResponse updateAuthor(Long id, String uploaderName, String editorStudentId) {
        return updateAuthor(id, uploaderName, null, editorStudentId);
    }

    @Transactional(readOnly = true)
    public List<ArchiveFileResponse> list() {
        return list(null);
    }

    @Transactional(readOnly = true)
    public List<ArchiveFileResponse> list(String studentId) {
        List<ArchiveFile> files = repo.findAllByOrderByUploadedAtDesc();
        Map<Long, VoteSummary> stats = voteStats(files);
        return files.stream().map(file -> toResponse(file, stats, studentId)).toList();
    }

    /**
     * Returns at most {@code limit} files in the same order as {@link #list()}, pushing the cap into the
     * query instead of loading every row and trimming in memory. Used by the mobile home preview.
     */
    @Transactional(readOnly = true)
    public List<ArchiveFileResponse> listLimited(int limit, String studentId) {
        List<ArchiveFile> files = repo.findAllByOrderByUploadedAtDesc(
                org.springframework.data.domain.PageRequest.of(0, limit));
        Map<Long, VoteSummary> stats = voteStats(files);
        return files.stream().map(file -> toResponse(file, stats, studentId)).toList();
    }

    @Transactional(readOnly = true)
    public ArchiveFile get(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public ArchiveFileResponse getAndIncrementView(Long id, String studentId) {
        ArchiveFile file = get(id);
        file.incrementViewCount();
        ArchiveFile saved = repo.save(file);
        return toResponse(saved, voteStats(List.of(saved)), studentId);
    }

    public void incrementView(Long id) {
        // Atomic increment avoids the lost-update race of read-then-save under concurrent views.
        repo.incrementViewCount(id);
    }

    public ArchiveFileResponse vote(String studentId, Long id, int value) {
        if (value < 0 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        ArchiveFile file = get(id);
        Optional<ArchiveFileVote> existing = voteRepository.findByArchiveFileIdAndStudentId(file.getId(), studentId);
        if (value == 0 || existing.isPresent()) {
            existing.ifPresent(voteRepository::delete);
        } else {
            ArchiveFileVote vote = new ArchiveFileVote();
            vote.setArchiveFileId(file.getId());
            vote.setStudentId(studentId);
            vote.setValue(1);
            voteRepository.save(vote);
        }
        return toResponse(file, voteStats(List.of(file)), studentId);
    }

    // archive.manage-gated — second lock behind ArchiveController's own @PreAuthorize; the
    // /api/files/** URL rule in SecurityConfig only requires a logged-in member.
    @PreAuthorize("@perm.has(authentication,'ARCHIVE_MANAGE')")
    public void delete(Long id) {
        ArchiveFile file = get(id);
        storage.delete(file.getStoredName());
        repo.delete(file);
    }

    private Map<Long, VoteSummary> voteStats(List<ArchiveFile> files) {
        List<Long> ids = files.stream().map(ArchiveFile::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return voteRepository.findByArchiveFileIdIn(ids).stream()
                .collect(Collectors.groupingBy(
                        ArchiveFileVote::getArchiveFileId,
                        Collectors.collectingAndThen(Collectors.toList(), VoteSummary::from)
                ));
    }

    private ArchiveFileResponse toResponse(ArchiveFile file, Map<Long, VoteSummary> voteStats, String studentId) {
        VoteSummary votes = voteStats.getOrDefault(file.getId(), VoteSummary.EMPTY);
        return new ArchiveFileResponse(
                file.getId(),
                file.getTitle() != null ? file.getTitle() : file.getOriginalName(),
                file.getDescription(),
                file.getOriginalName(),
                file.getMimeType(),
                file.getFileSize(),
                file.getUploadedBy(),
                file.getUploaderName(),
                file.getCategory().name(),
                file.getViewCount(),
                votes.upvotes(),
                votes.myVote(studentId),
                file.getUploadedAt(),
                contentVersion(file.getStoredName())
        );
    }

    private String contentVersion(String storedName) {
        if (storedName == null || storedName.isBlank()) {
            return null;
        }
        String filename = StringUtils.getFilename(storedName);
        if (filename == null || filename.isBlank()) {
            return storedName;
        }
        int separator = filename.indexOf('_');
        return separator > 0 ? filename.substring(0, separator) : filename;
    }

    private String archiveAuditDetail(ArchiveFile file, boolean replacedFile) {
        return "title=" + auditValue(file.getTitle())
                + ", category=" + auditValue(file.getCategory().name())
                + ", replacedFile=" + replacedFile;
    }

    private String normalizeTitle(String title) {
        if (title == null || title.isBlank()) {
            return null;
        }
        String cleaned = title.trim();
        if (cleaned.length() > MAX_TITLE_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목은 200자 이하여야 합니다.");
        }
        return cleaned;
    }

    private String auditValue(String value) {
        return value == null ? "" : value.replace("\n", " ").replace("\r", " ");
    }

    private void deleteAfterCommit(String storedName) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteBestEffort(storedName);
                }
            });
        } else {
            storage.delete(storedName);
        }
    }

    private void deleteAfterRollback(String storedName) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        deleteBestEffort(storedName);
                    }
                }
            });
        }
    }

    private void deleteBestEffort(String storedName) {
        try {
            storage.delete(storedName);
        } catch (RuntimeException e) {
            log.warn("Failed to delete archive blob {}", storedName, e);
        }
    }

    private record VoteSummary(long upvotes, Map<String, Integer> byStudent) {
        static final VoteSummary EMPTY = new VoteSummary(0, Map.of());

        static VoteSummary from(List<ArchiveFileVote> votes) {
            long upvotes = votes.stream().filter(vote -> vote.getValue() > 0).count();
            Map<String, Integer> byStudent = votes.stream()
                    .collect(Collectors.toMap(ArchiveFileVote::getStudentId, ArchiveFileVote::getValue, (a, b) -> b));
            return new VoteSummary(upvotes, byStudent);
        }

        int myVote(String studentId) {
            return studentId == null ? 0 : byStudent.getOrDefault(studentId, 0);
        }
    }

    /**
     * Resource descriptions now carry the same rich-editor block content as notices
     * and community posts, so they must pass through the shared sanitizer (which
     * rejects/normalizes externalEmbed iframes) before being stored. Blank stays null
     * for backward compatibility with legacy plain-text descriptions.
     */
    private String sanitizeDescription(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }
        return richContentSanitizer.sanitizeContent(description.trim());
    }

    private ArchiveFile.Category parseCategory(String value) {
        if (value == null || value.isBlank()) {
            return ArchiveFile.Category.GENERAL;
        }
        try {
            return ArchiveFile.Category.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid archive category.");
        }
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자료실 파일은 50MB 이하만 업로드할 수 있습니다.");
        }
        String baseContentType = baseContentType(file.getContentType());
        if (BLOCKED_MIME_TYPES.contains(baseContentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보안상 허용되지 않는 파일 형식입니다.");
        }
        String extension = StringUtils.getFilenameExtension(filename);
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 자료실 파일 확장자입니다.");
        }
        // The extension is client-supplied, so for the formats with a dependable signature check
        // that the bytes agree with it — otherwise `payload.exe.zip` gets stored as an archive.
        if (!UploadSniffer.matchesExtension(extension, UploadSniffer.header(file))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일 내용이 확장자와 일치하지 않습니다.");
        }
    }

    /**
     * Reduces a client-supplied content-type to its base {@code type/subtype}, stripping any
     * parameters (e.g. {@code charset}). This prevents blocklist bypasses such as
     * {@code text/html; charset=utf-8} slipping past an exact-match check.
     */
    private String baseContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            return (mediaType.getType() + "/" + mediaType.getSubtype()).toLowerCase(Locale.ROOT);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
    }
}
