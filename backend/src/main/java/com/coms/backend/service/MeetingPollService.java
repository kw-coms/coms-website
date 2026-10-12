package com.coms.backend.service;

import com.coms.backend.domain.MeetingPoll;
import com.coms.backend.domain.MeetingPollAvailability;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.MeetingPollDetailResponse;
import com.coms.backend.dto.MeetingPollRequest;
import com.coms.backend.dto.MeetingPollSummaryResponse;
import com.coms.backend.repository.MeetingPollAvailabilityRepository;
import com.coms.backend.repository.MeetingPollRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Meeting polls ("일정 조율"): any signed-in member opens a poll over a few dates and a daily
 * time window, every member marks the half-hour slots they are free in, and the page shows
 * when the most people can meet. Members only; other members see names, never student ids.
 */
@Service
@Transactional
public class MeetingPollService {
    static final int SLOT_MINUTES = 30;
    static final int MAX_DATES = 14;
    static final int MAX_POLLS_PER_MEMBER = 20;
    private static final int MINUTES_PER_DAY = 24 * 60;
    private static final int MAX_DAYS_AHEAD = 366;

    private final MeetingPollRepository pollRepository;
    private final MeetingPollAvailabilityRepository availabilityRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    public MeetingPollService(MeetingPollRepository pollRepository,
                              MeetingPollAvailabilityRepository availabilityRepository,
                              MemberRepository memberRepository,
                              Clock clock) {
        this.pollRepository = pollRepository;
        this.availabilityRepository = availabilityRepository;
        this.memberRepository = memberRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<MeetingPollSummaryResponse> list(String studentId) {
        Member member = requireMember(studentId);
        List<MeetingPoll> polls = pollRepository.findAllByOrderByCreatedAtDescIdDesc();
        if (polls.isEmpty()) return List.of();
        Map<Long, List<MeetingPollAvailability>> byPoll = availabilityRepository
                .findByPollIdIn(polls.stream().map(MeetingPoll::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(MeetingPollAvailability::getPollId));
        return polls.stream()
                .map(poll -> toSummary(poll, member, byPoll.getOrDefault(poll.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public MeetingPollDetailResponse get(Long id, String studentId) {
        Member member = requireMember(studentId);
        return toDetail(requirePoll(id), member);
    }

    public MeetingPollDetailResponse create(MeetingPollRequest request, String studentId) {
        Member member = requireMember(studentId);
        if (pollRepository.countByCreatorStudentId(member.getStudentId()) >= MAX_POLLS_PER_MEMBER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "만들 수 있는 일정 조율은 " + MAX_POLLS_PER_MEMBER + "개까지입니다. 지난 것을 지운 뒤 다시 만들어 주세요.");
        }

        String title = request.title() == null ? "" : request.title().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목을 입력해 주세요.");
        }
        String description = request.description() == null ? "" : request.description().trim();

        TreeSet<LocalDate> dates = new TreeSet<>(request.dates());
        if (dates.isEmpty() || dates.size() > MAX_DATES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "날짜는 1개 이상 " + MAX_DATES + "개 이하로 골라 주세요.");
        }
        LocalDate today = LocalDate.now(clock);
        // One day of slack so a member whose device is on another calendar day is not refused.
        if (dates.first().isBefore(today.minusDays(1)) || dates.last().isAfter(today.plusDays(MAX_DAYS_AHEAD))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "오늘부터 1년 안의 날짜만 고를 수 있습니다.");
        }

        int start = request.startMinute();
        int end = request.endMinute();
        if (start < 0 || end > MINUTES_PER_DAY || start >= end || start % SLOT_MINUTES != 0 || end % SLOT_MINUTES != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "시간 범위는 30분 단위로, 시작이 끝보다 앞서야 합니다.");
        }

        MeetingPoll poll = new MeetingPoll();
        poll.setTitle(title);
        poll.setDescription(description.isEmpty() ? null : description);
        poll.setCreatorStudentId(member.getStudentId());
        poll.setCreatorName(displayName(member));
        poll.setDates(dates.stream().map(LocalDate::toString).collect(Collectors.joining(",")));
        poll.setStartMinute(start);
        poll.setEndMinute(end);
        poll.setSlotMinutes(SLOT_MINUTES);
        poll.setCreatedAt(LocalDateTime.now(clock));
        return toDetail(pollRepository.save(poll), member);
    }

    /** Saves (or replaces) the member's answer. The string has to cover every slot of the poll. */
    public MeetingPollDetailResponse saveAvailability(Long id, String studentId, String slots) {
        Member member = requireMember(studentId);
        MeetingPoll poll = requirePoll(id);
        int expected = slotCount(poll);
        if (slots == null || slots.length() != expected || !slots.chars().allMatch(c -> c == '0' || c == '1')) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "가능 시간 표가 이 일정 조율과 맞지 않습니다. 새로고침 후 다시 시도해 주세요.");
        }
        MeetingPollAvailability availability = availabilityRepository
                .findByPollIdAndStudentId(poll.getId(), member.getStudentId())
                .orElseGet(MeetingPollAvailability::new);
        availability.setPollId(poll.getId());
        availability.setStudentId(member.getStudentId());
        availability.setMemberName(displayName(member));
        availability.setSlots(slots);
        availability.setUpdatedAt(LocalDateTime.now(clock));
        availabilityRepository.saveAndFlush(availability);
        return toDetail(poll, member);
    }

    /** Withdraws the member's answer altogether. */
    public MeetingPollDetailResponse clearAvailability(Long id, String studentId) {
        Member member = requireMember(studentId);
        MeetingPoll poll = requirePoll(id);
        availabilityRepository.deleteByPollIdAndStudentId(poll.getId(), member.getStudentId());
        availabilityRepository.flush();
        return toDetail(poll, member);
    }

    /** The member who opened a poll, or the president, may delete it with its answers. */
    public void delete(Long id, String studentId) {
        Member member = requireMember(studentId);
        MeetingPoll poll = requirePoll(id);
        if (!canDelete(poll, member)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "이 일정 조율을 지울 권한이 없습니다.");
        }
        availabilityRepository.deleteByPollId(poll.getId());
        pollRepository.delete(poll);
    }

    /**
     * Called when a member's account is removed: their answers everywhere, and the polls they
     * opened (with the answers in them), go with the account.
     */
    public void deleteDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        availabilityRepository.deleteByStudentId(studentId);
        for (MeetingPoll poll : pollRepository.findByCreatorStudentId(studentId)) {
            availabilityRepository.deleteByPollId(poll.getId());
            pollRepository.delete(poll);
        }
    }

    private Member requireMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private MeetingPoll requirePoll(Long id) {
        return pollRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "일정 조율을 찾을 수 없습니다."));
    }

    private boolean canDelete(MeetingPoll poll, Member member) {
        return poll.getCreatorStudentId().equals(member.getStudentId()) || member.getRole() == Member.Role.ADMIN;
    }

    private static String displayName(Member member) {
        String name = member.getName() == null ? "" : member.getName().trim();
        return name.isEmpty() ? "회원" : name;
    }

    private static List<LocalDate> datesOf(MeetingPoll poll) {
        return Arrays.stream(poll.getDates().split(",")).map(String::trim).filter(s -> !s.isEmpty()).map(LocalDate::parse).toList();
    }

    private static int slotCount(MeetingPoll poll) {
        return datesOf(poll).size() * ((poll.getEndMinute() - poll.getStartMinute()) / poll.getSlotMinutes());
    }

    private MeetingPollSummaryResponse toSummary(MeetingPoll poll, Member member, List<MeetingPollAvailability> availabilities) {
        boolean answered = availabilities.stream().anyMatch(a -> a.getStudentId().equals(member.getStudentId()));
        return new MeetingPollSummaryResponse(
                poll.getId(),
                poll.getTitle(),
                poll.getDescription(),
                poll.getCreatorName(),
                poll.getCreatorStudentId().equals(member.getStudentId()),
                canDelete(poll, member),
                datesOf(poll),
                poll.getStartMinute(),
                poll.getEndMinute(),
                poll.getSlotMinutes(),
                poll.getCreatedAt(),
                availabilities.size(),
                answered
        );
    }

    private MeetingPollDetailResponse toDetail(MeetingPoll poll, Member member) {
        int expected = slotCount(poll);
        List<MeetingPollAvailability> availabilities = availabilityRepository.findByPollIdOrderByUpdatedAtAscIdAsc(poll.getId())
                .stream()
                // A row that no longer fits the grid cannot be drawn; leave it out rather than fail the page.
                .filter(a -> a.getSlots() != null && a.getSlots().length() == expected)
                .toList();
        List<MeetingPollDetailResponse.Participant> participants = availabilities.stream()
                .map(a -> new MeetingPollDetailResponse.Participant(
                        a.getMemberName(),
                        a.getStudentId().equals(member.getStudentId()),
                        a.getSlots()))
                .toList();
        return new MeetingPollDetailResponse(toSummary(poll, member, availabilities), participants);
    }
}
