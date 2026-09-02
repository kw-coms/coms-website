package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.domain.ClubProjectFile;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.repository.ClubProjectFileRepository;
import com.coms.backend.repository.ClubProjectRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class ClubProjectService {

    // Distributables (apk/zip and similar). Generous limit so app/game builds fit.
    private static final long MAX_FILE_BYTES = 200L * 1024 * 1024;
    private static final int MAX_FILES_PER_PROJECT = 10;
    private static final Set<String> ALLOWED_DISTRIBUTABLE_EXTENSIONS = Set.of("zip", "apk", "pdf");

    private final ClubProjectRepository repository;
    private final ClubProjectFileRepository fileRepository;
    private final ClubProjectCategoryService categoryService;
    private final StorageService storageService;

    public ClubProjectService(ClubProjectRepository repository,
                              ClubProjectFileRepository fileRepository,
                              ClubProjectCategoryService categoryService,
                              StorageService storageService) {
        this.repository = repository;
        this.fileRepository = fileRepository;
        this.categoryService = categoryService;
        this.storageService = storageService;
    }

    @Transactional(readOnly = true)
    public List<ClubProjectResponse> list() {
        List<ClubProject> projects = repository.findAllByOrderByPositionAscIdAsc();
        Map<String, String> categoryNames = categoryService.keyToNameMap();
        Map<Long, List<ClubProjectFile>> files = filesByProject(projects);
        return projects.stream()
                .map(project -> toResponse(project, categoryNames, files))
                .toList();
    }

    public ClubProjectResponse create(String category, String title, String description, String eyebrow,
                                      String madeBy, String linkUrl, String displayUrl, Integer position) {
        ClubProject project = new ClubProject();
        applyFields(project, category, title, description, eyebrow, madeBy, linkUrl, displayUrl);
        project.setPosition(position != null ? position : nextPosition());
        project.setCreatedAt(LocalDateTime.now());
        project.setUpdatedAt(LocalDateTime.now());
        ClubProject saved = repository.save(project);
        return toResponse(saved);
    }

    public ClubProjectResponse update(Long id, String category, String title, String description, String eyebrow,
                                      String madeBy, String linkUrl, String displayUrl, Integer position) {
        ClubProject project = get(id);
        if (category != null && !category.isBlank()) {
            project.setCategory(resolveCategory(category));
        }
        if (title != null) {
            if (title.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 제목을 입력하세요.");
            }
            project.setTitle(title.trim());
        }
        if (description != null) {
            project.setDescription(description.isBlank() ? null : description.trim());
        }
        if (eyebrow != null) {
            project.setEyebrow(eyebrow.isBlank() ? null : eyebrow.trim());
        }
        if (madeBy != null) {
            project.setMadeBy(madeBy.isBlank() ? null : madeBy.trim());
        }
        if (linkUrl != null) {
            project.setLinkUrl(cleanProjectUrl(linkUrl, true));
        }
        if (displayUrl != null) {
            project.setDisplayUrl(cleanProjectUrl(displayUrl, false));
        }
        if (position != null) {
            project.setPosition(position);
        }
        project.setUpdatedAt(LocalDateTime.now());
        ClubProject saved = repository.save(project);
        return toResponse(saved);
    }

    public void delete(Long id) {
        ClubProject project = get(id);
        for (ClubProjectFile file : fileRepository.findByClubProjectIdOrderByPositionAsc(id)) {
            storageService.delete(file.getStoredName());
        }
        fileRepository.deleteByClubProjectId(id);
        repository.delete(project);
    }

    public Long addFile(Long id, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 파일을 선택하세요.");
        }
        ClubProject project = get(id);
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "배포 파일은 200MB 이하만 업로드할 수 있습니다.");
        }
        validateDistributable(file);
        List<ClubProjectFile> existing = fileRepository.findByClubProjectIdOrderByPositionAsc(id);
        if (existing.size() >= MAX_FILES_PER_PROJECT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "배포 파일은 최대 " + MAX_FILES_PER_PROJECT + "개까지 업로드할 수 있습니다.");
        }
        try {
            String stored = storageService.store(file);
            String contentType = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
            ClubProjectFile saved = fileRepository.save(new ClubProjectFile(
                    project.getId(), stored, cleanOriginalFilename(file), contentType, file.getSize(), existing.size()));
            return saved.getId();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
    }

    public void deleteFile(Long id, Long fileId) {
        ClubProjectFile file = fileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!file.getClubProjectId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        storageService.delete(file.getStoredName());
        fileRepository.delete(file);
    }

    @Transactional(readOnly = true)
    public ClubProjectFile loadFileMeta(Long id, Long fileId) {
        ClubProjectFile file = fileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!file.getClubProjectId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return file;
    }

    @Transactional(readOnly = true)
    public Resource loadFileResource(Long id, Long fileId) {
        return storageService.load(loadFileMeta(id, fileId).getStoredName());
    }

    @Transactional(readOnly = true)
    public ClubProject get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void applyFields(ClubProject project, String category, String title, String description, String eyebrow,
                             String madeBy, String linkUrl, String displayUrl) {
        project.setCategory(resolveCategory(category));
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 제목을 입력하세요.");
        }
        project.setTitle(title.trim());
        project.setDescription(description != null && !description.isBlank() ? description.trim() : null);
        project.setEyebrow(eyebrow != null && !eyebrow.isBlank() ? eyebrow.trim() : null);
        project.setMadeBy(madeBy != null && !madeBy.isBlank() ? madeBy.trim() : null);
        project.setLinkUrl(cleanProjectUrl(linkUrl, true));
        project.setDisplayUrl(cleanProjectUrl(displayUrl, false));
    }

    private String resolveCategory(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 분류를 선택하세요.");
        }
        String key = value.trim();
        categoryService.requireValidKey(key);
        return key;
    }

    private int nextPosition() {
        return repository.findAllByOrderByPositionAscIdAsc().stream()
                .mapToInt(ClubProject::getPosition)
                .max()
                .orElse(-1) + 1;
    }

    /**
     * Distributables are downloaded by the public, so the upload is restricted to the three
     * formats this feature exists for, verified by signature rather than by the client-supplied
     * extension: zip and apk are both ZIP containers, pdf starts with {@code %PDF}.
     */
    private void validateDistributable(MultipartFile file) {
        String extension = StringUtils.getFilenameExtension(cleanOriginalFilename(file));
        String normalized = extension == null ? "" : extension.toLowerCase(Locale.ROOT);
        if (!ALLOWED_DISTRIBUTABLE_EXTENSIONS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "배포 파일은 ZIP, APK, PDF만 업로드할 수 있습니다.");
        }
        byte[] header = UploadSniffer.header(file);
        boolean matches = "pdf".equals(normalized) ? UploadSniffer.isPdf(header) : UploadSniffer.isZip(header);
        if (!matches) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일 내용이 확장자와 일치하지 않습니다.");
        }
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        return StringUtils.cleanPath(filename == null ? "" : filename);
    }

    private String cleanProjectUrl(String value, boolean requireScheme) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        if (containsControlCharacter(trimmed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 링크는 http(s) 형식이어야 합니다.");
        }
        String parseTarget = requireScheme || hasScheme(trimmed) ? trimmed : "https://" + trimmed;
        URI uri;
        try {
            uri = new URI(parseTarget);
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 링크는 http(s) 형식이어야 합니다.");
        }
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 링크는 http(s) 형식이어야 합니다.");
        }
        if (uri.getRawUserInfo() != null || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "프로젝트 링크는 http(s) 형식이어야 합니다.");
        }
        return trimmed;
    }

    private boolean containsControlCharacter(String value) {
        for (int i = 0; i < value.length(); i++) {
            if (Character.isISOControl(value.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    private boolean hasScheme(String value) {
        return value.matches("^[A-Za-z][A-Za-z0-9+.-]*:.*");
    }

    private Map<Long, List<ClubProjectFile>> filesByProject(List<ClubProject> projects) {
        List<Long> ids = projects.stream().map(ClubProject::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return fileRepository.findByClubProjectIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubProjectFile::getClubProjectId));
    }

    private ClubProjectResponse toResponse(ClubProject project) {
        return toResponse(project, categoryService.keyToNameMap(), filesByProject(List.of(project)));
    }

    private ClubProjectResponse toResponse(ClubProject project,
                                           Map<String, String> categoryNames,
                                           Map<Long, List<ClubProjectFile>> filesByProject) {
        List<ClubProjectFile> files = filesByProject.getOrDefault(project.getId(), List.of());
        List<ClubProjectResponse.FileInfo> fileInfos = files.stream()
                .map(file -> new ClubProjectResponse.FileInfo(
                        file.getId(),
                        "/api/club-projects/" + project.getId() + "/files/" + file.getId() + "/download",
                        file.getOriginalName(),
                        file.getFileSize()))
                .toList();

        return new ClubProjectResponse(
                project.getId(),
                project.getCategory(),
                categoryNames.getOrDefault(project.getCategory(), project.getCategory()),
                project.getTitle(),
                project.getDescription(),
                project.getEyebrow(),
                project.getMadeBy(),
                project.getLinkUrl(),
                project.getDisplayUrl(),
                project.getPosition(),
                fileInfos,
                project.getCreatedAt(),
                project.getUpdatedAt()
        );
    }
}
