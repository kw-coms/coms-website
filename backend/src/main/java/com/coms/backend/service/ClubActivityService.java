package com.coms.backend.service;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.domain.ClubActivityFile;
import com.coms.backend.domain.ClubActivityImage;
import com.coms.backend.domain.ClubActivityVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ClubActivityResponse;
import com.coms.backend.repository.ClubActivityFileRepository;
import com.coms.backend.repository.ClubActivityImageRepository;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class ClubActivityService {

    private static final long MAX_IMAGE_BYTES = 20L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final int MAX_TITLE_LENGTH = 150;
    private static final int MAX_DESCRIPTION_LENGTH = 2_000;
    private static final int MAX_IMAGES_PER_ACTIVITY = 12;
    private static final int MAX_FILES_PER_ACTIVITY = 10;
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp"
    );

    private final ClubActivityRepository repository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;
    private final ClubActivityVoteRepository voteRepository;
    private final ClubActivityImageRepository imageRepository;
    private final ClubActivityFileRepository fileRepository;
    private final ClubActivityCategoryService categoryService;

    public ClubActivityService(ClubActivityRepository repository,
                               MemberRepository memberRepository,
                               StorageService storageService,
                               ClubActivityVoteRepository voteRepository,
                               ClubActivityImageRepository imageRepository,
                               ClubActivityFileRepository fileRepository,
                               ClubActivityCategoryService categoryService) {
        this.repository = repository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
        this.voteRepository = voteRepository;
        this.imageRepository = imageRepository;
        this.fileRepository = fileRepository;
        this.categoryService = categoryService;
    }

    @Transactional(readOnly = true)
    public List<ClubActivityResponse> list() {
        return list(null);
    }

    @Transactional(readOnly = true)
    public List<ClubActivityResponse> list(String studentId) {
        List<ClubActivity> activities = repository.findAllByOrderByEventDateDescCreatedAtDesc();
        Map<Long, VoteSummary> stats = voteStats(activities);
        Map<String, String> categoryNames = categoryService.keyToNameMap();
        Map<Long, List<ClubActivityImage>> images = imagesByActivity(activities);
        Map<Long, List<ClubActivityFile>> files = filesByActivity(activities);
        return activities.stream()
                .map(activity -> toResponse(activity, stats, categoryNames, images, files, studentId))
                .toList();
    }

    public ClubActivityResponse getAndIncrementView(Long id, String studentId) {
        ClubActivity activity = get(id);
        activity.incrementViewCount();
        ClubActivity saved = repository.save(activity);
        return toResponse(saved, studentId);
    }

    public ClubActivityResponse vote(String studentId, Long id, int value) {
        if (value < 0 || value > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid vote value.");
        }
        memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        ClubActivity activity = get(id);
        Optional<ClubActivityVote> existing = voteRepository.findByClubActivityIdAndStudentId(activity.getId(), studentId);
        if (value == 0 || existing.isPresent()) {
            existing.ifPresent(voteRepository::delete);
        } else {
            ClubActivityVote vote = new ClubActivityVote();
            vote.setClubActivityId(activity.getId());
            vote.setStudentId(studentId);
            vote.setValue(1);
            voteRepository.save(vote);
        }
        return toResponse(activity, studentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse create(String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       MultipartFile image,
                                       String creatorStudentId) throws IOException {
        return create(kind, category, title, description, eventDate, eventDate, null, null, image, creatorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse create(String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       LocalDate endDate,
                                       String startTime,
                                       String endTime,
                                       MultipartFile image,
                                       String creatorStudentId) throws IOException {
        return create(kind, category, title, description, eventDate, endDate, startTime, endTime, null, image, creatorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse create(String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       LocalDate endDate,
                                       String startTime,
                                       String endTime,
                                       String colorHex,
                                       MultipartFile image,
                                       String creatorStudentId) throws IOException {
        ClubActivity.Kind parsedKind = parseKind(kind);
        String categoryKey = resolveCategory(category);
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity title is required.");
        }
        if (eventDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity date is required.");
        }
        LocalDate normalizedEndDate = normalizeEndDate(eventDate, endDate);
        LocalTime parsedStartTime = parseTime(startTime);
        LocalTime parsedEndTime = parseTime(endTime);
        validateTimeRange(parsedStartTime, parsedEndTime);
        String normalizedColor = normalizeColorHex(colorHex);

        Member member = memberRepository.findByStudentId(creatorStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        ClubActivity activity = new ClubActivity();
        activity.setKind(parsedKind);
        activity.setCategory(categoryKey);
        activity.setTitle(boundedText(title, MAX_TITLE_LENGTH, "제목"));
        activity.setDescription(description != null && !description.isBlank() ? boundedText(description, MAX_DESCRIPTION_LENGTH, "설명") : null);
        activity.setEventDate(eventDate);
        activity.setEndDate(normalizedEndDate);
        activity.setStartTime(parsedStartTime);
        activity.setEndTime(parsedEndTime);
        activity.setColorHex(normalizedColor);
        activity.setCreatedBy(creatorStudentId);
        activity.setCreatedByName(member.getName());
        activity.setCreatedAt(LocalDateTime.now());
        activity.setUpdatedAt(LocalDateTime.now());

        boolean hasImage = image != null && !image.isEmpty();
        if (parsedKind == ClubActivity.Kind.SCHEDULE && hasImage) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Schedule entries cannot include images.");
        }

        String storedImage = null;
        if (hasImage) {
            validateImage(image);
            storedImage = storageService.storeImage(image, image.getContentType());
            activity.setImageStoredName(storedImage);
            activity.setImageOriginalName(cleanOriginalFilename(image));
            activity.setImageMimeType(image.getContentType());
            activity.setImageSize(image.getSize());
        }

        try {
            ClubActivity saved = repository.save(activity);
            // Mirror the legacy single image into the new image table so all images
            // flow through the same multi-image rendering path.
            if (storedImage != null) {
                imageRepository.save(new ClubActivityImage(saved.getId(), storedImage,
                        activity.getImageOriginalName(), activity.getImageMimeType(), 0));
            }
            return toResponse(saved, creatorStudentId);
        } catch (RuntimeException e) {
            if (storedImage != null) storageService.delete(storedImage);
            throw e;
        }
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse update(Long id,
                                       String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       String editorStudentId) {
        return update(id, kind, category, title, description, eventDate, null, null, null, editorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse update(Long id,
                                       String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       LocalDate endDate,
                                       String startTime,
                                       String endTime,
                                       String editorStudentId) {
        return update(id, kind, category, title, description, eventDate, endDate, startTime, endTime, null, editorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubActivityResponse update(Long id,
                                       String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       LocalDate endDate,
                                       String startTime,
                                       String endTime,
                                       String colorHex,
                                       String editorStudentId) {
        ClubActivity activity = get(id);
        if (kind != null && !kind.isBlank()) {
            activity.setKind(parseKind(kind));
        }
        if (category != null && !category.isBlank()) {
            activity.setCategory(resolveCategory(category));
        }
        if (title != null) {
            if (title.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity title is required.");
            }
            activity.setTitle(boundedText(title, MAX_TITLE_LENGTH, "제목"));
        }
        if (description != null) {
            activity.setDescription(description.isBlank() ? null : boundedText(description, MAX_DESCRIPTION_LENGTH, "설명"));
        }
        if (eventDate != null) {
            activity.setEventDate(eventDate);
            if (endDate == null) {
                activity.setEndDate(eventDate);
            }
        }
        if (endDate != null) {
            activity.setEndDate(normalizeEndDate(activity.getEventDate(), endDate));
        } else if (activity.getEndDate() == null) {
            activity.setEndDate(activity.getEventDate());
        }
        if (startTime != null) {
            activity.setStartTime(parseTime(startTime));
        }
        if (endTime != null) {
            activity.setEndTime(parseTime(endTime));
        }
        if (colorHex != null) {
            activity.setColorHex(normalizeColorHex(colorHex));
        }
        validateTimeRange(activity.getStartTime(), activity.getEndTime());
        activity.setUpdatedAt(LocalDateTime.now());
        ClubActivity saved = repository.save(activity);
        return toResponse(saved, editorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public List<Long> addImages(Long id, List<MultipartFile> images) {
        if (images == null || images.isEmpty()) return List.of();
        ClubActivity activity = get(id);
        List<ClubActivityImage> existing = imageRepository.findByClubActivityIdOrderByPositionAsc(id);
        long uploadCount = images.stream().filter(image -> image != null && !image.isEmpty()).count();
        if (existing.size() + uploadCount > MAX_IMAGES_PER_ACTIVITY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "활동 사진은 최대 " + MAX_IMAGES_PER_ACTIVITY + "개까지 업로드할 수 있습니다.");
        }
        int startPos = existing.size();
        List<Long> createdIds = new ArrayList<>();
        int offset = 0;
        for (MultipartFile image : images) {
            if (image == null || image.isEmpty()) continue;
            validateImage(image);
            try {
                String stored = storageService.storeImage(image, image.getContentType());
                ClubActivityImage saved = imageRepository.save(new ClubActivityImage(
                        activity.getId(), stored, cleanOriginalFilename(image), image.getContentType(), startPos + offset));
                createdIds.add(saved.getId());
                offset++;
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
            }
        }
        return createdIds;
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public void deleteImage(Long id, Long imageId) {
        ClubActivityImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!image.getClubActivityId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        storageService.delete(image.getStoredName());
        imageRepository.delete(image);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public Long addFile(Long id, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "첨부할 파일을 선택하세요.");
        }
        ClubActivity activity = get(id);
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "첨부 파일은 50MB 이하만 업로드할 수 있습니다.");
        }
        List<ClubActivityFile> existing = fileRepository.findByClubActivityIdOrderByPositionAsc(id);
        if (existing.size() >= MAX_FILES_PER_ACTIVITY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "첨부 파일은 최대 " + MAX_FILES_PER_ACTIVITY + "개까지 업로드할 수 있습니다.");
        }
        try {
            String stored = storageService.store(file);
            String contentType = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
            ClubActivityFile saved = fileRepository.save(new ClubActivityFile(
                    activity.getId(), stored, cleanOriginalFilename(file), contentType, existing.size()));
            return saved.getId();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public void deleteFile(Long id, Long fileId) {
        ClubActivityFile file = fileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!file.getClubActivityId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        storageService.delete(file.getStoredName());
        fileRepository.delete(file);
    }

    @Transactional(readOnly = true)
    public ClubActivityImage loadImageMeta(Long id, Long imageId) {
        ClubActivityImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!image.getClubActivityId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return image;
    }

    @Transactional(readOnly = true)
    public Resource loadImageResource(Long id, Long imageId) {
        return storageService.load(loadImageMeta(id, imageId).getStoredName());
    }

    @Transactional(readOnly = true)
    public ClubActivityFile loadFileMeta(Long id, Long fileId) {
        ClubActivityFile file = fileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!file.getClubActivityId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return file;
    }

    @Transactional(readOnly = true)
    public Resource loadFileResource(Long id, Long fileId) {
        return storageService.load(loadFileMeta(id, fileId).getStoredName());
    }

    @Transactional(readOnly = true)
    public ClubActivity get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public void delete(Long id) {
        ClubActivity activity = get(id);
        for (ClubActivityImage image : imageRepository.findByClubActivityIdOrderByPositionAsc(id)) {
            storageService.delete(image.getStoredName());
        }
        for (ClubActivityFile file : fileRepository.findByClubActivityIdOrderByPositionAsc(id)) {
            storageService.delete(file.getStoredName());
        }
        imageRepository.deleteByClubActivityId(id);
        fileRepository.deleteByClubActivityId(id);
        if (activity.getImageStoredName() != null) {
            storageService.delete(activity.getImageStoredName());
        }
        repository.delete(activity);
    }

    private ClubActivity.Kind parseKind(String value) {
        if (value == null || value.isBlank()) {
            return ClubActivity.Kind.ACTIVITY;
        }
        try {
            return ClubActivity.Kind.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid activity kind.");
        }
    }

    private LocalDate normalizeEndDate(LocalDate eventDate, LocalDate endDate) {
        LocalDate normalized = endDate == null ? eventDate : endDate;
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity end date is required.");
        }
        if (normalized.isBefore(eventDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료일은 시작일과 같거나 이후여야 합니다.");
        }
        return normalized;
    }

    private LocalTime parseTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시간 형식이 올바르지 않습니다. (HH:mm)");
        }
    }

    private void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (startTime != null && endTime != null && endTime.isBefore(startTime)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종료 시간은 시작 시간 이후여야 합니다.");
        }
    }

    private String resolveCategory(String value) {
        String key = value == null || value.isBlank() ? "GENERAL" : value.trim();
        categoryService.requireValidKey(key);
        return key;
    }

    private String normalizeColorHex(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (!normalized.matches("^#[0-9a-f]{6}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "색상은 #RRGGBB 형식이어야 합니다.");
        }
        return normalized;
    }

    private void validateImage(MultipartFile image) {
        String contentType = image.getContentType();
        if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image uploads are allowed for activity records.");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity image must be 20MB or smaller.");
        }
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        return StringUtils.cleanPath(filename == null ? "" : filename);
    }

    private Map<Long, VoteSummary> voteStats(List<ClubActivity> activities) {
        List<Long> ids = activities.stream().map(ClubActivity::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return voteRepository.findByClubActivityIdIn(ids).stream()
                .collect(Collectors.groupingBy(
                        ClubActivityVote::getClubActivityId,
                        Collectors.collectingAndThen(Collectors.toList(), VoteSummary::from)
                ));
    }

    private Map<Long, List<ClubActivityImage>> imagesByActivity(List<ClubActivity> activities) {
        List<Long> ids = activities.stream().map(ClubActivity::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return imageRepository.findByClubActivityIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubActivityImage::getClubActivityId));
    }

    private Map<Long, List<ClubActivityFile>> filesByActivity(List<ClubActivity> activities) {
        List<Long> ids = activities.stream().map(ClubActivity::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return fileRepository.findByClubActivityIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubActivityFile::getClubActivityId));
    }

    private ClubActivityResponse toResponse(ClubActivity activity, String studentId) {
        return toResponse(activity, voteStats(List.of(activity)), categoryService.keyToNameMap(),
                imagesByActivity(List.of(activity)), filesByActivity(List.of(activity)), studentId);
    }

    private ClubActivityResponse toResponse(ClubActivity activity,
                                            Map<Long, VoteSummary> voteStats,
                                            Map<String, String> categoryNames,
                                            Map<Long, List<ClubActivityImage>> imagesByActivity,
                                            Map<Long, List<ClubActivityFile>> filesByActivity,
                                            String studentId) {
        VoteSummary votes = voteStats.getOrDefault(activity.getId(), VoteSummary.EMPTY);
        List<ClubActivityImage> images = imagesByActivity.getOrDefault(activity.getId(), List.of());
        List<ClubActivityFile> files = filesByActivity.getOrDefault(activity.getId(), List.of());

        List<ClubActivityResponse.MediaInfo> imageInfos = images.stream()
                .map(img -> new ClubActivityResponse.MediaInfo(
                        img.getId(),
                        "/api/club-activities/" + activity.getId() + "/images/" + img.getId(),
                        img.getOriginalName()))
                .toList();
        List<ClubActivityResponse.MediaInfo> fileInfos = files.stream()
                .map(file -> new ClubActivityResponse.MediaInfo(
                        file.getId(),
                        "/api/club-activities/" + activity.getId() + "/files/" + file.getId() + "/download",
                        file.getOriginalName()))
                .toList();

        // Backward-compatible primary image url: prefer the first multi-image,
        // otherwise the legacy single-image endpoint.
        String primaryImageUrl;
        String primaryImageName;
        if (!imageInfos.isEmpty()) {
            primaryImageUrl = imageInfos.get(0).url();
            primaryImageName = imageInfos.get(0).originalName();
        } else if (activity.getImageStoredName() != null) {
            primaryImageUrl = "/api/club-activities/" + activity.getId() + "/image";
            primaryImageName = activity.getImageOriginalName();
        } else {
            primaryImageUrl = null;
            primaryImageName = null;
        }

        return new ClubActivityResponse(
                activity.getId(),
                activity.getKind().name(),
                activity.getCategory(),
                categoryNames.getOrDefault(activity.getCategory(), activity.getCategory()),
                activity.getTitle(),
                activity.getDescription(),
                activity.getEventDate(),
                activity.getEndDate(),
                activity.getStartTime() == null ? null : activity.getStartTime().toString(),
                activity.getEndTime() == null ? null : activity.getEndTime().toString(),
                activity.getColorHex(),
                primaryImageUrl,
                primaryImageName,
                imageInfos,
                fileInfos,
                activity.getCreatedByName(),
                activity.getViewCount(),
                votes.upvotes(),
                votes.myVote(studentId),
                activity.getCreatedAt(),
                activity.getUpdatedAt()
        );
    }

    private record VoteSummary(long upvotes, Map<String, Integer> byStudent) {
        static final VoteSummary EMPTY = new VoteSummary(0, Map.of());

        static VoteSummary from(List<ClubActivityVote> votes) {
            long upvotes = votes.stream().filter(vote -> vote.getValue() > 0).count();
            Map<String, Integer> byStudent = votes.stream()
                    .collect(Collectors.toMap(ClubActivityVote::getStudentId, ClubActivityVote::getValue, (a, b) -> b));
            return new VoteSummary(upvotes, byStudent);
        }

        int myVote(String studentId) {
            return studentId == null ? 0 : byStudent.getOrDefault(studentId, 0);
        }
    }

    private String boundedText(String value, int maxLength, String fieldName) {
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "은 " + maxLength + "자 이하로 입력하세요.");
        }
        return trimmed;
    }
}
