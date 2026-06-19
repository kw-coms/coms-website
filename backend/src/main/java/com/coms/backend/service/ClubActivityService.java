package com.coms.backend.service;

import com.coms.backend.domain.ClubActivity;
import com.coms.backend.domain.ClubActivityVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ClubActivityResponse;
import com.coms.backend.repository.ClubActivityRepository;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

    public ClubActivityService(ClubActivityRepository repository,
                               MemberRepository memberRepository,
                               StorageService storageService,
                               ClubActivityVoteRepository voteRepository) {
        this.repository = repository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
        this.voteRepository = voteRepository;
    }

    @Transactional(readOnly = true)
    public List<ClubActivityResponse> list() {
        return list(null);
    }

    @Transactional(readOnly = true)
    public List<ClubActivityResponse> list(String studentId) {
        List<ClubActivity> activities = repository.findAllByOrderByEventDateDescCreatedAtDesc();
        Map<Long, VoteSummary> stats = voteStats(activities);
        return activities.stream()
                .map(activity -> toResponse(activity, stats, studentId))
                .toList();
    }

    public ClubActivityResponse getAndIncrementView(Long id, String studentId) {
        ClubActivity activity = get(id);
        activity.incrementViewCount();
        ClubActivity saved = repository.save(activity);
        return toResponse(saved, voteStats(List.of(saved)), studentId);
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
        return toResponse(activity, voteStats(List.of(activity)), studentId);
    }

    public ClubActivityResponse create(String kind,
                                       String category,
                                       String title,
                                       String description,
                                       LocalDate eventDate,
                                       MultipartFile image,
                                       String creatorStudentId) throws IOException {
        ClubActivity.Kind parsedKind = parseKind(kind);
        ClubActivity.Category parsedCategory = parseCategory(category);
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity title is required.");
        }
        if (eventDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activity date is required.");
        }

        Member member = memberRepository.findByStudentId(creatorStudentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        ClubActivity activity = new ClubActivity();
        activity.setKind(parsedKind);
        activity.setCategory(parsedCategory);
        activity.setTitle(title.trim());
        activity.setDescription(description != null && !description.isBlank() ? description.trim() : null);
        activity.setEventDate(eventDate);
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
            return toResponse(saved, voteStats(List.of(saved)), creatorStudentId);
        } catch (RuntimeException e) {
            if (storedImage != null) storageService.delete(storedImage);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public ClubActivity get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public void delete(Long id) {
        ClubActivity activity = get(id);
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

    private ClubActivity.Category parseCategory(String value) {
        if (value == null || value.isBlank()) {
            return ClubActivity.Category.GENERAL;
        }
        try {
            return ClubActivity.Category.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid activity category.");
        }
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

    private ClubActivityResponse toResponse(ClubActivity activity, Map<Long, VoteSummary> voteStats, String studentId) {
        VoteSummary votes = voteStats.getOrDefault(activity.getId(), VoteSummary.EMPTY);
        return new ClubActivityResponse(
                activity.getId(),
                activity.getKind().name(),
                activity.getCategory().name(),
                activity.getTitle(),
                activity.getDescription(),
                activity.getEventDate(),
                activity.getImageStoredName() == null ? null : "/api/club-activities/" + activity.getId() + "/image",
                activity.getImageOriginalName(),
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
}
