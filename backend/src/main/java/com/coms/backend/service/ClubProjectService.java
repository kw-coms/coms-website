package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.domain.ClubProjectFile;
import com.coms.backend.domain.ClubProjectImage;
import com.coms.backend.dto.ClubProjectResponse;
import com.coms.backend.repository.ClubProjectFileRepository;
import com.coms.backend.repository.ClubProjectLikeRepository;
import com.coms.backend.repository.ClubProjectCommentRepository;
import com.coms.backend.repository.ClubProjectRepository;
import com.coms.backend.repository.ClubProjectImageRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
    private static final int MAX_IMAGES_PER_PROJECT = 6;
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    // Column widths of club_projects (V54).
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_EYEBROW_LENGTH = 60;
    private static final int MAX_MADE_BY_LENGTH = 100;
    private static final Set<String> ALLOWED_DISTRIBUTABLE_EXTENSIONS = Set.of("zip", "apk", "pdf");

    private final ClubProjectRepository repository;
    private final ClubProjectFileRepository fileRepository;
    private final ClubProjectCategoryService categoryService;
    private final ClubProjectImageRepository imageRepository;
    private final ClubProjectLikeRepository likeRepository;
    private final ClubProjectCommentRepository commentRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final CommunityTextService textService;

    public ClubProjectService(ClubProjectRepository repository,
                              ClubProjectFileRepository fileRepository,
                              ClubProjectImageRepository imageRepository,
                              ClubProjectLikeRepository likeRepository,
                              ClubProjectCommentRepository commentRepository,
                              MemberRepository memberRepository,
                              ClubProjectCategoryService categoryService,
                              StorageService storageService,
                              CommunityTextService textService) {
        this.repository = repository;
        this.fileRepository = fileRepository;
        this.imageRepository = imageRepository;
        this.likeRepository = likeRepository;
        this.commentRepository = commentRepository;
        this.memberRepository = memberRepository;
        this.categoryService = categoryService;
        this.storageService = storageService;
        this.textService = textService;
    }

    @Transactional(readOnly = true)
    public List<ClubProjectResponse> list() { return list(null, false); }

    @Transactional(readOnly = true)
    public List<ClubProjectResponse> list(String viewerStudentId, boolean manager) {
        List<ClubProject> projects = repository.findAllByOrderByPositionAscIdAsc();
        Map<String, String> categoryNames = categoryService.keyToNameMap();
        Map<Long, List<ClubProjectFile>> files = filesByProject(projects);
        Map<Long, List<ClubProjectImage>> images = imagesByProject(projects);
        EngagementCounts engagement = engagement(projects, viewerStudentId);
        return projects.stream()
                .map(project -> toResponse(project, categoryNames, files, images, engagement, viewerStudentId, manager))
                .toList();
    }

    public ClubProjectResponse detail(Long id, String viewerStudentId, boolean manager) {
        if (repository.incrementViewCount(id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return toResponse(get(id), viewerStudentId, manager);
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

    public ClubProjectResponse createForMember(String studentId, String category, String title,
                                               String description, String madeBy, String linkUrl) {
        String name = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN)).getName();
        ClubProjectResponse response = create(category, title, description, null,
                madeBy == null ? name : madeBy, linkUrl, null, null);
        ClubProject project = get(response.id());
        project.setOwnerStudentId(studentId);
        return toResponse(repository.save(project), studentId, false);
    }

    public void requireEditor(Long id, String studentId, boolean manager) {
        ClubProject project = get(id);
        if (!manager && (studentId == null || !studentId.equals(project.getOwnerStudentId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인 작품만 수정할 수 있습니다.");
        }
    }

    public ClubProjectResponse updateForMember(Long id, String studentId, String category,
                                               String title, String description, String madeBy, String linkUrl) {
        requireEditor(id, studentId, false);
        update(id, category, title, description, null, madeBy, linkUrl, null, null);
        return toResponse(get(id), studentId, false);
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
            project.setTitle(bounded(title, MAX_TITLE_LENGTH, "프로젝트 제목"));
        }
        if (description != null) {
            project.setDescription(description.isBlank() ? null : description.trim());
        }
        if (eyebrow != null) {
            project.setEyebrow(eyebrow.isBlank() ? null : bounded(eyebrow, MAX_EYEBROW_LENGTH, "분류 문구"));
        }
        if (madeBy != null) {
            project.setMadeBy(cleanMadeBy(madeBy));
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
        commentRepository.deleteByClubProjectId(id);
        likeRepository.deleteByClubProjectId(id);
        for (ClubProjectImage image : imageRepository.findByClubProjectIdOrderByPositionAsc(id)) {
            storageService.delete(image.getStoredName());
        }
        imageRepository.deleteByClubProjectId(id);
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

    public List<Long> addImages(Long id, List<MultipartFile> images) {
        get(id);
        if (images == null || images.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진을 선택하세요.");
        }
        List<ClubProjectImage> existing = imageRepository.findByClubProjectIdOrderByPositionAsc(id);
        if (existing.size() + images.size() > MAX_IMAGES_PER_PROJECT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진은 최대 6장까지 올릴 수 있습니다.");
        }
        for (MultipartFile image : images) validateImage(image);
        List<Long> ids = new java.util.ArrayList<>();
        List<String> storedNames = new java.util.ArrayList<>();
        int position = existing.stream().mapToInt(ClubProjectImage::getPosition).max().orElse(-1) + 1;
        try {
            for (MultipartFile image : images) {
                String stored = storageService.storeImage(image, image.getContentType());
                storedNames.add(stored);
                ids.add(imageRepository.save(new ClubProjectImage(id, stored, image.getContentType(), position++)).getId());
            }
        } catch (IOException | RuntimeException e) {
            storedNames.forEach(storageService::delete);
            if (e instanceof IOException) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "사진 저장에 실패했습니다.", e);
            }
            throw (RuntimeException) e;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) storedNames.forEach(storageService::delete);
                }
            });
        }
        return ids;
    }

    private void validateImage(MultipartFile image) {
        if (image == null || image.isEmpty() || image.getSize() > MAX_IMAGE_BYTES ||
                !("image/jpeg".equals(image.getContentType()) || "image/png".equals(image.getContentType()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "10MB 이하 JPEG 또는 PNG 사진만 올릴 수 있습니다.");
        }
        byte[] header = UploadSniffer.header(image);
        if (UploadSniffer.imageType(header) == null ||
                !image.getContentType().equals(UploadSniffer.imageType(header).mimeType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진 형식이 파일 내용과 일치하지 않습니다.");
        }
    }

    public void deleteImage(Long id, Long imageId) {
        ClubProjectImage image = loadImageMeta(id, imageId);
        storageService.delete(image.getStoredName());
        imageRepository.delete(image);
    }

    @Transactional(readOnly = true)
    public ClubProjectImage loadImageMeta(Long id, Long imageId) {
        ClubProjectImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!image.getClubProjectId().equals(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return image;
    }

    @Transactional(readOnly = true)
    public Resource loadImageResource(Long id, Long imageId) {
        return storageService.load(loadImageMeta(id, imageId).getStoredName());
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
        project.setTitle(bounded(title, MAX_TITLE_LENGTH, "프로젝트 제목"));
        project.setDescription(description != null && !description.isBlank() ? description.trim() : null);
        project.setEyebrow(eyebrow != null && !eyebrow.isBlank() ? bounded(eyebrow, MAX_EYEBROW_LENGTH, "분류 문구") : null);
        project.setMadeBy(cleanMadeBy(madeBy));
        project.setLinkUrl(cleanProjectUrl(linkUrl, true));
        project.setDisplayUrl(cleanProjectUrl(displayUrl, false));
    }

    private static String bounded(String value, int maxLength, String label) {
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "은(는) " + maxLength + "자 이하로 입력하세요.");
        }
        return trimmed;
    }

    private String cleanMadeBy(String value) {
        if (value == null || value.isBlank()) return null;
        String cleaned = textService.normalizeBounded(value, "제작자", MAX_MADE_BY_LENGTH);
        textService.rejectUnsafeText(cleaned);
        if (cleaned.chars().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제작자는 한 줄로 입력하세요.");
        }
        return cleaned;
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

    private Map<Long, List<ClubProjectImage>> imagesByProject(List<ClubProject> projects) {
        List<Long> ids = projects.stream().map(ClubProject::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        return imageRepository.findByClubProjectIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubProjectImage::getClubProjectId));
    }

    private ClubProjectResponse toResponse(ClubProject project) {
        return toResponse(project, null, false);
    }

    private ClubProjectResponse toResponse(ClubProject project, String viewerStudentId, boolean manager) {
        return toResponse(project, categoryService.keyToNameMap(), filesByProject(List.of(project)),
                imagesByProject(List.of(project)), engagement(List.of(project), viewerStudentId), viewerStudentId, manager);
    }

    private record EngagementCounts(Map<Long, Long> likes, Map<Long, Long> comments, Set<Long> likedByViewer) {}

    private EngagementCounts engagement(List<ClubProject> projects, String viewerStudentId) {
        List<Long> ids = projects.stream().map(ClubProject::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return new EngagementCounts(Map.of(), Map.of(), Set.of());
        Map<Long, Long> likes = likeRepository.countByProjectIds(ids).stream()
                .collect(Collectors.toMap(ClubProjectLikeRepository.LikeCount::getProjectId,
                        ClubProjectLikeRepository.LikeCount::getTotal));
        Map<Long, Long> comments = commentRepository.countByProjectIds(ids).stream()
                .collect(Collectors.toMap(ClubProjectCommentRepository.CommentCount::getProjectId,
                        ClubProjectCommentRepository.CommentCount::getTotal));
        Set<Long> liked = viewerStudentId == null ? Set.of()
                : Set.copyOf(likeRepository.findLikedProjectIds(ids, viewerStudentId));
        return new EngagementCounts(likes, comments, liked);
    }

    private ClubProjectResponse toResponse(ClubProject project,
                                           Map<String, String> categoryNames,
                                           Map<Long, List<ClubProjectFile>> filesByProject,
                                           Map<Long, List<ClubProjectImage>> imagesByProject,
                                           EngagementCounts engagement,
                                           String viewerStudentId, boolean manager) {
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
                manager || (viewerStudentId != null && viewerStudentId.equals(project.getOwnerStudentId())),
                imagesByProject.getOrDefault(project.getId(), List.of()).stream()
                        .map(image -> new ClubProjectResponse.ImageInfo(image.getId(),
                                "/api/club-projects/" + project.getId() + "/images/" + image.getId()))
                        .toList(),
                project.getCreatedAt(),
                project.getUpdatedAt(),
                project.getViewCount(),
                engagement.likes().getOrDefault(project.getId(), 0L),
                engagement.comments().getOrDefault(project.getId(), 0L),
                engagement.likedByViewer().contains(project.getId())
        );
    }
}
