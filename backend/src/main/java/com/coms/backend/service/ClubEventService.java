package com.coms.backend.service;

import com.coms.backend.domain.ClubEvent;
import com.coms.backend.domain.ClubEventEntry;
import com.coms.backend.domain.ClubEventEntryFile;
import com.coms.backend.domain.ClubEventRsvp;
import com.coms.backend.domain.ClubEventVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ClubEventResponse;
import com.coms.backend.repository.ClubEventEntryFileRepository;
import com.coms.backend.repository.ClubEventEntryRepository;
import com.coms.backend.repository.ClubEventRepository;
import com.coms.backend.repository.ClubEventRsvpRepository;
import com.coms.backend.repository.ClubEventVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class ClubEventService {

    private static final long MAX_ENTRY_FILE_BYTES = 50L * 1024 * 1024;
    private static final int MAX_TITLE_LENGTH = 150;
    private static final int MAX_DESCRIPTION_LENGTH = 2_000;
    private static final int MAX_ENTRY_WORK_TYPE_LENGTH = 40;
    private static final int MAX_ENTRY_AUTHOR_LENGTH = 100;
    private static final int MAX_ENTRY_SUMMARY_LENGTH = 500;
    private static final int MAX_ENTRY_TAGS_LENGTH = 500;
    private static final int MAX_ENTRY_EXTERNAL_URL_LENGTH = 500;

    private final ClubEventRepository eventRepository;
    private final ClubEventEntryRepository entryRepository;
    private final ClubEventEntryFileRepository entryFileRepository;
    private final ClubEventVoteRepository voteRepository;
    private final ClubEventRsvpRepository rsvpRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;

    public ClubEventService(ClubEventRepository eventRepository,
                            ClubEventEntryRepository entryRepository,
                            ClubEventEntryFileRepository entryFileRepository,
                            ClubEventVoteRepository voteRepository,
                            ClubEventRsvpRepository rsvpRepository,
                            MemberRepository memberRepository,
                            StorageService storageService) {
        this.eventRepository = eventRepository;
        this.entryRepository = entryRepository;
        this.entryFileRepository = entryFileRepository;
        this.voteRepository = voteRepository;
        this.rsvpRepository = rsvpRepository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
    }

    @Transactional(readOnly = true)
    public List<ClubEventResponse> list(String studentId) {
        List<ClubEvent> events = eventRepository.findAllByOrderByCreatedAtDesc();
        Map<Long, List<ClubEventEntry>> entries = entriesByEvent(events);
        Map<Long, List<ClubEventEntryFile>> files = filesByEntry(entries.values().stream().flatMap(List::stream).toList());
        Map<Long, List<ClubEventVote>> votes = votesByEvent(events);
        Map<Long, List<ClubEventRsvp>> rsvps = rsvpsByEvent(events);
        return events.stream()
                .map(event -> toResponse(event,
                        entries.getOrDefault(event.getId(), List.of()),
                        files,
                        votes.getOrDefault(event.getId(), List.of()),
                        rsvps.getOrDefault(event.getId(), List.of()),
                        studentId))
                .toList();
    }

    @Transactional(readOnly = true)
    public ClubEventResponse get(Long id, String studentId) {
        ClubEvent event = getEvent(id);
        List<ClubEventEntry> entries = entryRepository.findByClubEventIdOrderByPositionAscCreatedAtAsc(id);
        return toResponse(event,
                entries,
                filesByEntry(entries),
                voteRepository.findByClubEventId(id),
                rsvpRepository.findByClubEventId(id),
                studentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubEventResponse createEvent(String title,
                                         String description,
                                         LocalDateTime startsAt,
                                         LocalDateTime endsAt,
                                         String creatorStudentId) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이벤트 제목을 입력하세요.");
        }
        validateWindow(startsAt, endsAt);
        Member member = requireMember(creatorStudentId);

        ClubEvent event = new ClubEvent();
        event.setTitle(boundedTitle(title));
        event.setDescription(normalizeOptional(description, MAX_DESCRIPTION_LENGTH, "설명"));
        event.setStartsAt(startsAt);
        event.setEndsAt(endsAt);
        event.setCreatedBy(member.getStudentId());
        event.setCreatedByName(member.getName());
        event.setCreatedAt(LocalDateTime.now());
        event.setUpdatedAt(LocalDateTime.now());
        return toResponse(eventRepository.save(event), List.of(), Map.of(), List.of(), List.of(), creatorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubEventResponse updateEvent(Long id,
                                         String title,
                                         String description,
                                         LocalDateTime startsAt,
                                         LocalDateTime endsAt,
                                         String editorStudentId) {
        requireMember(editorStudentId);
        ClubEvent event = getEvent(id);
        if (title != null) {
            if (title.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이벤트 제목을 입력하세요.");
            }
            event.setTitle(boundedTitle(title));
        }
        if (description != null) {
            event.setDescription(normalizeOptional(description, MAX_DESCRIPTION_LENGTH, "설명"));
        }
        LocalDateTime nextStart = startsAt == null ? event.getStartsAt() : startsAt;
        LocalDateTime nextEnd = endsAt == null ? event.getEndsAt() : endsAt;
        validateWindow(nextStart, nextEnd);
        event.setStartsAt(nextStart);
        event.setEndsAt(nextEnd);
        event.setUpdatedAt(LocalDateTime.now());
        return get(eventRepository.save(event).getId(), editorStudentId);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public ClubEventResponse.Entry addEntry(Long eventId,
                                            String title,
                                            String authorName,
                                            String description,
                                            String workType,
                                            String summary,
                                            String tags,
                                            String externalUrl,
                                            List<MultipartFile> files,
                                            String creatorStudentId) {
        requireMember(creatorStudentId);
        ClubEvent event = getEvent(eventId);
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "작품 제목을 입력하세요.");
        }
        List<MultipartFile> uploadFiles = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        if (uploadFiles.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 회지 파일을 선택하세요.");
        }
        for (MultipartFile file : uploadFiles) {
            if (file.getSize() > MAX_ENTRY_FILE_BYTES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이벤트 파일은 50MB 이하만 업로드할 수 있습니다.");
            }
        }

        List<String> storedNames = new ArrayList<>();
        try {
            MultipartFile primaryFile = uploadFiles.get(0);
            String primaryStored = storageService.store(primaryFile);
            storedNames.add(primaryStored);
            ClubEventEntry entry = new ClubEventEntry();
            entry.setClubEventId(event.getId());
            entry.setTitle(boundedTitle(title));
            entry.setAuthorName(normalizeOptional(authorName, MAX_ENTRY_AUTHOR_LENGTH, "작성자/팀"));
            entry.setDescription(normalizeOptional(description, MAX_DESCRIPTION_LENGTH, "설명"));
            entry.setWorkType(normalizeOptional(workType, MAX_ENTRY_WORK_TYPE_LENGTH, "작품 종류"));
            entry.setSummary(normalizeOptional(summary, MAX_ENTRY_SUMMARY_LENGTH, "한줄 소개"));
            entry.setTags(normalizeOptional(tags, MAX_ENTRY_TAGS_LENGTH, "태그"));
            entry.setExternalUrl(normalizeExternalUrl(externalUrl));
            entry.setStoredName(primaryStored);
            entry.setOriginalName(cleanOriginalFilename(primaryFile));
            entry.setMimeType(contentType(primaryFile));
            entry.setFileSize(primaryFile.getSize());
            entry.setPosition((int) entryRepository.countByClubEventId(event.getId()));
            entry.setCreatedAt(LocalDateTime.now());
            ClubEventEntry saved = entryRepository.save(entry);
            List<ClubEventEntryFile> savedFiles = new ArrayList<>();
            savedFiles.add(entryFileRepository.save(new ClubEventEntryFile(
                    saved.getId(),
                    primaryStored,
                    cleanOriginalFilename(primaryFile),
                    contentType(primaryFile),
                    primaryFile.getSize(),
                    0)));
            for (int i = 1; i < uploadFiles.size(); i++) {
                MultipartFile file = uploadFiles.get(i);
                String stored = storageService.store(file);
                storedNames.add(stored);
                savedFiles.add(entryFileRepository.save(new ClubEventEntryFile(
                        saved.getId(),
                        stored,
                        cleanOriginalFilename(file),
                        contentType(file),
                        file.getSize(),
                        i)));
            }
            event.setUpdatedAt(LocalDateTime.now());
            eventRepository.save(event);
            return toEntryResponse(event.getId(), saved, savedFiles, 0, false, 0);
        } catch (IOException e) {
            storedNames.forEach(storageService::delete);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이벤트 파일 저장에 실패했습니다.");
        } catch (RuntimeException e) {
            storedNames.forEach(storageService::delete);
            throw e;
        }
    }

    public ClubEventResponse vote(Long eventId, Long entryId, String studentId) {
        requireMember(studentId);
        ClubEvent event = getEvent(eventId);
        if (!isVotingOpen(event, LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "현재 투표할 수 없는 이벤트입니다.");
        }
        ClubEventEntry entry = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!entry.getClubEventId().equals(event.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "해당 이벤트의 작품이 아닙니다.");
        }

        Optional<ClubEventVote> existing = voteRepository.findByClubEventIdAndStudentId(event.getId(), studentId);
        if (existing.isPresent()) {
            applyVote(existing.get(), entry);
        } else {
            ClubEventVote vote = new ClubEventVote();
            vote.setClubEventId(event.getId());
            vote.setEntryId(entry.getId());
            vote.setStudentId(studentId);
            vote.setCreatedAt(LocalDateTime.now());
            vote.setUpdatedAt(LocalDateTime.now());
            try {
                voteRepository.saveAndFlush(vote);
            } catch (DataIntegrityViolationException e) {
                // A concurrent request already inserted this member's vote and tripped the unique
                // constraint. Re-read it and reconcile the chosen entry instead of failing with a 500.
                voteRepository.findByClubEventIdAndStudentId(event.getId(), studentId)
                        .ifPresent(reread -> applyVote(reread, entry));
            }
        }
        return get(event.getId(), studentId);
    }

    private void applyVote(ClubEventVote vote, ClubEventEntry entry) {
        if (!vote.getEntryId().equals(entry.getId())) {
            vote.setEntryId(entry.getId());
            vote.setUpdatedAt(LocalDateTime.now());
            voteRepository.save(vote);
        }
    }

    public ClubEventResponse rsvp(Long eventId, String studentId, String status) {
        requireMember(studentId);
        ClubEvent event = getEvent(eventId);
        ClubEventRsvp.Status parsedStatus = parseRsvpStatus(status);

        Optional<ClubEventRsvp> existing = rsvpRepository.findByClubEventIdAndStudentId(event.getId(), studentId);
        if (existing.isPresent()) {
            applyRsvp(existing.get(), parsedStatus);
        } else {
            ClubEventRsvp rsvp = new ClubEventRsvp();
            rsvp.setClubEventId(event.getId());
            rsvp.setStudentId(studentId);
            rsvp.setStatus(parsedStatus);
            rsvp.setCreatedAt(LocalDateTime.now());
            rsvp.setUpdatedAt(LocalDateTime.now());
            try {
                rsvpRepository.saveAndFlush(rsvp);
            } catch (DataIntegrityViolationException e) {
                // A concurrent request already inserted this member's RSVP and tripped the unique
                // constraint. Re-read it and reconcile the chosen status instead of failing with a 500.
                rsvpRepository.findByClubEventIdAndStudentId(event.getId(), studentId)
                        .ifPresent(reread -> applyRsvp(reread, parsedStatus));
            }
        }
        return get(event.getId(), studentId);
    }

    private void applyRsvp(ClubEventRsvp rsvp, ClubEventRsvp.Status parsedStatus) {
        if (rsvp.getStatus() != parsedStatus) {
            rsvp.setStatus(parsedStatus);
            rsvp.setUpdatedAt(LocalDateTime.now());
            rsvpRepository.save(rsvp);
        }
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public void deleteEntry(Long eventId, Long entryId) {
        getEvent(eventId);
        ClubEventEntry entry = loadEntryMeta(eventId, entryId);
        voteRepository.deleteByEntryId(entry.getId());
        deleteEntryFiles(entry);
        entryRepository.delete(entry);
    }

    @PreAuthorize("hasAnyRole('ADMIN','OFFICER')")
    public void deleteEvent(Long id) {
        ClubEvent event = getEvent(id);
        List<ClubEventEntry> entries = entryRepository.findByClubEventIdOrderByPositionAscCreatedAtAsc(id);
        for (ClubEventEntry entry : entries) {
            deleteEntryFiles(entry);
        }
        voteRepository.deleteByClubEventId(id);
        rsvpRepository.deleteByClubEventId(id);
        entryFileRepository.deleteByEntryIdIn(entries.stream().map(ClubEventEntry::getId).toList());
        entryRepository.deleteByClubEventId(id);
        eventRepository.delete(event);
    }

    @Transactional(readOnly = true)
    public ClubEventEntry loadEntryMeta(Long eventId, Long entryId) {
        ClubEventEntry entry = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!entry.getClubEventId().equals(eventId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return entry;
    }

    @Transactional(readOnly = true)
    public Resource loadEntryResource(Long eventId, Long entryId) {
        return storageService.load(loadEntryMeta(eventId, entryId).getStoredName());
    }

    @Transactional(readOnly = true)
    public ClubEventEntryFile loadEntryFileMeta(Long eventId, Long entryId, Long fileId) {
        loadEntryMeta(eventId, entryId);
        ClubEventEntryFile file = entryFileRepository.findById(fileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!file.getEntryId().equals(entryId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return file;
    }

    @Transactional(readOnly = true)
    public Resource loadEntryFileResource(Long eventId, Long entryId, Long fileId) {
        return storageService.load(loadEntryFileMeta(eventId, entryId, fileId).getStoredName());
    }

    @Transactional(readOnly = true)
    public ClubEvent getEvent(Long id) {
        return eventRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Member requireMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private void validateWindow(LocalDateTime startsAt, LocalDateTime endsAt) {
        if (startsAt == null || endsAt == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 시작과 종료 시간을 입력하세요.");
        }
        if (endsAt.isBefore(startsAt)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "투표 종료는 시작 이후여야 합니다.");
        }
    }

    private String boundedTitle(String title) {
        String trimmed = title.trim();
        if (trimmed.length() > MAX_TITLE_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목은 " + MAX_TITLE_LENGTH + "자 이하로 입력하세요.");
        }
        return trimmed;
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalizeOptional(String value, int maxLength, String fieldName) {
        String normalized = normalizeOptional(value);
        if (normalized != null && normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + "은 " + maxLength + "자 이하로 입력하세요.");
        }
        return normalized;
    }

    private String normalizeExternalUrl(String value) {
        String normalized = normalizeOptional(value, MAX_ENTRY_EXTERNAL_URL_LENGTH, "관련 링크");
        if (normalized == null) return null;
        String lower = normalized.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "관련 링크는 http:// 또는 https://로 시작해야 합니다.");
        }
        return normalized;
    }

    private boolean isVotingOpen(ClubEvent event, LocalDateTime now) {
        return !now.isBefore(event.getStartsAt()) && !now.isAfter(event.getEndsAt());
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        String cleaned = StringUtils.cleanPath(filename == null ? "" : filename);
        return cleaned.isBlank() ? "event-entry" : cleaned;
    }

    private String contentType(MultipartFile file) {
        return file.getContentType() == null ? "application/octet-stream" : file.getContentType();
    }

    private Map<Long, List<ClubEventEntry>> entriesByEvent(List<ClubEvent> events) {
        List<Long> ids = events.stream().map(ClubEvent::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        return entryRepository.findByClubEventIdInOrderByPositionAscCreatedAtAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubEventEntry::getClubEventId));
    }

    private Map<Long, List<ClubEventVote>> votesByEvent(List<ClubEvent> events) {
        List<Long> ids = events.stream().map(ClubEvent::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        return voteRepository.findByClubEventIdIn(ids).stream()
                .collect(Collectors.groupingBy(ClubEventVote::getClubEventId));
    }

    private Map<Long, List<ClubEventRsvp>> rsvpsByEvent(List<ClubEvent> events) {
        List<Long> ids = events.stream().map(ClubEvent::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        return rsvpRepository.findByClubEventIdIn(ids).stream()
                .collect(Collectors.groupingBy(ClubEventRsvp::getClubEventId));
    }

    private ClubEventRsvp.Status parseRsvpStatus(String status) {
        if (status == null || status.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "참석 응답 상태를 입력하세요.");
        }
        try {
            return ClubEventRsvp.Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "참석 응답 상태가 올바르지 않습니다.");
        }
    }

    private Map<Long, List<ClubEventEntryFile>> filesByEntry(List<ClubEventEntry> entries) {
        List<Long> ids = entries.stream().map(ClubEventEntry::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        return entryFileRepository.findByEntryIdInOrderByPositionAsc(ids).stream()
                .collect(Collectors.groupingBy(ClubEventEntryFile::getEntryId));
    }

    private ClubEventResponse toResponse(ClubEvent event,
                                         List<ClubEventEntry> entries,
                                         Map<Long, List<ClubEventEntryFile>> files,
                                         List<ClubEventVote> votes,
                                         List<ClubEventRsvp> rsvps,
                                         String studentId) {
        Map<ClubEventRsvp.Status, Long> rsvpCounts = rsvps.stream()
                .collect(Collectors.groupingBy(ClubEventRsvp::getStatus, Collectors.counting()));
        String myRsvpStatus = rsvps.stream()
                .filter(rsvp -> studentId != null && studentId.equals(rsvp.getStudentId()))
                .map(rsvp -> rsvp.getStatus().name())
                .findFirst()
                .orElse(null);

        Map<Long, Long> voteCounts = votes.stream()
                .collect(Collectors.groupingBy(ClubEventVote::getEntryId, Collectors.counting()));
        Long myEntryId = votes.stream()
                .filter(vote -> studentId != null && studentId.equals(vote.getStudentId()))
                .map(ClubEventVote::getEntryId)
                .findFirst()
                .orElse(null);

        List<ClubEventEntry> rankedEntries = new ArrayList<>(entries);
        rankedEntries.sort(Comparator
                .comparingLong((ClubEventEntry entry) -> voteCounts.getOrDefault(entry.getId(), 0L)).reversed()
                .thenComparingInt(ClubEventEntry::getPosition)
                .thenComparing(ClubEventEntry::getId));

        List<ClubEventResponse.Entry> entryResponses = new ArrayList<>();
        for (int i = 0; i < rankedEntries.size(); i++) {
            ClubEventEntry entry = rankedEntries.get(i);
            long voteCount = voteCounts.getOrDefault(entry.getId(), 0L);
            entryResponses.add(toEntryResponse(event.getId(), entry, files.getOrDefault(entry.getId(), List.of()), voteCount, entry.getId().equals(myEntryId), i + 1));
        }

        return new ClubEventResponse(
                event.getId(),
                event.getTitle(),
                event.getDescription(),
                event.getStartsAt(),
                event.getEndsAt(),
                isVotingOpen(event, LocalDateTime.now()),
                votes.size(),
                myEntryId,
                entries.size(),
                entryResponses,
                rsvpCounts.getOrDefault(ClubEventRsvp.Status.GOING, 0L),
                rsvpCounts.getOrDefault(ClubEventRsvp.Status.MAYBE, 0L),
                rsvpCounts.getOrDefault(ClubEventRsvp.Status.NOT_GOING, 0L),
                myRsvpStatus,
                event.getCreatedByName(),
                event.getCreatedAt(),
                event.getUpdatedAt()
        );
    }

    private ClubEventResponse.Entry toEntryResponse(Long eventId,
                                                    ClubEventEntry entry,
                                                    List<ClubEventEntryFile> files,
                                                    long voteCount,
                                                    boolean myVote,
                                                    int rank) {
        List<ClubEventResponse.EntryFile> fileResponses = entryFilesResponse(eventId, entry, files);
        return new ClubEventResponse.Entry(
                entry.getId(),
                entry.getTitle(),
                entry.getAuthorName(),
                entry.getDescription(),
                entry.getWorkType(),
                entry.getSummary(),
                entry.getTags(),
                entry.getExternalUrl(),
                "/api/club-events/" + eventId + "/entries/" + entry.getId() + "/download",
                entry.getOriginalName(),
                entry.getMimeType(),
                entry.getFileSize(),
                fileResponses,
                voteCount,
                myVote,
                rank,
                entry.getCreatedAt()
        );
    }

    private List<ClubEventResponse.EntryFile> entryFilesResponse(Long eventId,
                                                                 ClubEventEntry entry,
                                                                 List<ClubEventEntryFile> files) {
        if (files == null || files.isEmpty()) {
            return List.of(new ClubEventResponse.EntryFile(
                    null,
                    "/api/club-events/" + eventId + "/entries/" + entry.getId() + "/download",
                    entry.getOriginalName(),
                    entry.getMimeType(),
                    entry.getFileSize()
            ));
        }
        return files.stream()
                .map(file -> new ClubEventResponse.EntryFile(
                        file.getId(),
                        "/api/club-events/" + eventId + "/entries/" + entry.getId() + "/files/" + file.getId() + "/download",
                        file.getOriginalName(),
                        file.getMimeType(),
                        file.getFileSize()
                ))
                .toList();
    }

    private void deleteEntryFiles(ClubEventEntry entry) {
        List<ClubEventEntryFile> files = entryFileRepository.findByEntryIdOrderByPositionAsc(entry.getId());
        List<String> storedNames = new ArrayList<>(files.stream().map(ClubEventEntryFile::getStoredName).toList());
        if (entry.getStoredName() != null && !storedNames.contains(entry.getStoredName())) {
            storedNames.add(entry.getStoredName());
        }
        storedNames.forEach(storageService::delete);
        entryFileRepository.deleteByEntryId(entry.getId());
    }
}
