package com.coms.backend.service;

import com.coms.backend.domain.ClubEvent;
import com.coms.backend.domain.ClubEventEntry;
import com.coms.backend.domain.ClubEventVote;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.ClubEventResponse;
import com.coms.backend.repository.ClubEventEntryRepository;
import com.coms.backend.repository.ClubEventRepository;
import com.coms.backend.repository.ClubEventVoteRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
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
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class ClubEventService {

    private static final long MAX_ENTRY_FILE_BYTES = 50L * 1024 * 1024;

    private final ClubEventRepository eventRepository;
    private final ClubEventEntryRepository entryRepository;
    private final ClubEventVoteRepository voteRepository;
    private final MemberRepository memberRepository;
    private final StorageService storageService;

    public ClubEventService(ClubEventRepository eventRepository,
                            ClubEventEntryRepository entryRepository,
                            ClubEventVoteRepository voteRepository,
                            MemberRepository memberRepository,
                            StorageService storageService) {
        this.eventRepository = eventRepository;
        this.entryRepository = entryRepository;
        this.voteRepository = voteRepository;
        this.memberRepository = memberRepository;
        this.storageService = storageService;
    }

    @Transactional(readOnly = true)
    public List<ClubEventResponse> list(String studentId) {
        List<ClubEvent> events = eventRepository.findAllByOrderByCreatedAtDesc();
        Map<Long, List<ClubEventEntry>> entries = entriesByEvent(events);
        Map<Long, List<ClubEventVote>> votes = votesByEvent(events);
        return events.stream()
                .map(event -> toResponse(event,
                        entries.getOrDefault(event.getId(), List.of()),
                        votes.getOrDefault(event.getId(), List.of()),
                        studentId))
                .toList();
    }

    @Transactional(readOnly = true)
    public ClubEventResponse get(Long id, String studentId) {
        ClubEvent event = getEvent(id);
        return toResponse(event,
                entryRepository.findByClubEventIdOrderByPositionAscCreatedAtAsc(id),
                voteRepository.findByClubEventId(id),
                studentId);
    }

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
        event.setTitle(title.trim());
        event.setDescription(normalizeOptional(description));
        event.setStartsAt(startsAt);
        event.setEndsAt(endsAt);
        event.setCreatedBy(member.getStudentId());
        event.setCreatedByName(member.getName());
        event.setCreatedAt(LocalDateTime.now());
        event.setUpdatedAt(LocalDateTime.now());
        return toResponse(eventRepository.save(event), List.of(), List.of(), creatorStudentId);
    }

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
            event.setTitle(title.trim());
        }
        if (description != null) {
            event.setDescription(normalizeOptional(description));
        }
        LocalDateTime nextStart = startsAt == null ? event.getStartsAt() : startsAt;
        LocalDateTime nextEnd = endsAt == null ? event.getEndsAt() : endsAt;
        validateWindow(nextStart, nextEnd);
        event.setStartsAt(nextStart);
        event.setEndsAt(nextEnd);
        event.setUpdatedAt(LocalDateTime.now());
        return get(eventRepository.save(event).getId(), editorStudentId);
    }

    public ClubEventResponse.Entry addEntry(Long eventId,
                                            String title,
                                            String authorName,
                                            String description,
                                            MultipartFile file,
                                            String creatorStudentId) {
        requireMember(creatorStudentId);
        ClubEvent event = getEvent(eventId);
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "작품 제목을 입력하세요.");
        }
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 회지 파일을 선택하세요.");
        }
        if (file.getSize() > MAX_ENTRY_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이벤트 파일은 50MB 이하만 업로드할 수 있습니다.");
        }

        String stored = null;
        try {
            stored = storageService.store(file);
            ClubEventEntry entry = new ClubEventEntry();
            entry.setClubEventId(event.getId());
            entry.setTitle(title.trim());
            entry.setAuthorName(normalizeOptional(authorName));
            entry.setDescription(normalizeOptional(description));
            entry.setStoredName(stored);
            entry.setOriginalName(cleanOriginalFilename(file));
            entry.setMimeType(file.getContentType() == null ? "application/octet-stream" : file.getContentType());
            entry.setFileSize(file.getSize());
            entry.setPosition((int) entryRepository.countByClubEventId(event.getId()));
            entry.setCreatedAt(LocalDateTime.now());
            ClubEventEntry saved = entryRepository.save(entry);
            event.setUpdatedAt(LocalDateTime.now());
            eventRepository.save(event);
            return toEntryResponse(event.getId(), saved, 0, false, 0);
        } catch (IOException e) {
            if (stored != null) storageService.delete(stored);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "이벤트 파일 저장에 실패했습니다.");
        } catch (RuntimeException e) {
            if (stored != null) storageService.delete(stored);
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
            ClubEventVote vote = existing.get();
            if (!vote.getEntryId().equals(entry.getId())) {
                vote.setEntryId(entry.getId());
                vote.setUpdatedAt(LocalDateTime.now());
                voteRepository.save(vote);
            }
        } else {
            ClubEventVote vote = new ClubEventVote();
            vote.setClubEventId(event.getId());
            vote.setEntryId(entry.getId());
            vote.setStudentId(studentId);
            vote.setCreatedAt(LocalDateTime.now());
            vote.setUpdatedAt(LocalDateTime.now());
            voteRepository.save(vote);
        }
        return get(event.getId(), studentId);
    }

    public void deleteEntry(Long eventId, Long entryId) {
        getEvent(eventId);
        ClubEventEntry entry = loadEntryMeta(eventId, entryId);
        voteRepository.deleteByEntryId(entry.getId());
        storageService.delete(entry.getStoredName());
        entryRepository.delete(entry);
    }

    public void deleteEvent(Long id) {
        ClubEvent event = getEvent(id);
        List<ClubEventEntry> entries = entryRepository.findByClubEventIdOrderByPositionAscCreatedAtAsc(id);
        for (ClubEventEntry entry : entries) {
            storageService.delete(entry.getStoredName());
        }
        voteRepository.deleteByClubEventId(id);
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

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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

    private ClubEventResponse toResponse(ClubEvent event,
                                         List<ClubEventEntry> entries,
                                         List<ClubEventVote> votes,
                                         String studentId) {
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
            entryResponses.add(toEntryResponse(event.getId(), entry, voteCount, entry.getId().equals(myEntryId), i + 1));
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
                event.getCreatedByName(),
                event.getCreatedAt(),
                event.getUpdatedAt()
        );
    }

    private ClubEventResponse.Entry toEntryResponse(Long eventId,
                                                    ClubEventEntry entry,
                                                    long voteCount,
                                                    boolean myVote,
                                                    int rank) {
        return new ClubEventResponse.Entry(
                entry.getId(),
                entry.getTitle(),
                entry.getAuthorName(),
                entry.getDescription(),
                "/api/club-events/" + eventId + "/entries/" + entry.getId() + "/download",
                entry.getOriginalName(),
                entry.getMimeType(),
                entry.getFileSize(),
                voteCount,
                myVote,
                rank,
                entry.getCreatedAt()
        );
    }
}
