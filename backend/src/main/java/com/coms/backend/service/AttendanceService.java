package com.coms.backend.service;

import com.coms.backend.domain.AttendanceRecord;
import com.coms.backend.domain.AttendanceSession;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.AttendanceCheckInResponse;
import com.coms.backend.dto.AttendanceDetailResponse;
import com.coms.backend.dto.AttendanceOpenRequest;
import com.coms.backend.dto.AttendanceSessionResponse;
import com.coms.backend.dto.AttendanceSummaryResponse;
import com.coms.backend.repository.AttendanceRecordRepository;
import com.coms.backend.repository.AttendanceSessionRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.SlidingWindowRateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Attendance ("출석 체크"). Whoever runs a seminar opens a session and shows its four-digit
 * code; members check in with the code from their own devices while the session is open.
 * Members see their own attendance and the head count; who attended, and how often, is shown
 * to those who may run attendance, as names only.
 */
@Service
@Transactional
public class AttendanceService {
    static final int CODE_LENGTH = 4;
    static final int MAX_CHECK_IN_ATTEMPTS = 10;
    static final Duration CHECK_IN_ATTEMPT_WINDOW = Duration.ofMinutes(5);
    private static final String REMOVED_MEMBER_ID = "removed";
    private static final String REMOVED_MEMBER_NAME = "탈퇴한 회원";

    private final AttendanceSessionRepository sessionRepository;
    private final AttendanceRecordRepository recordRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    /** A code is four digits, so guessing is bounded per member: wrong codes count, right ones do not. */
    private final SlidingWindowRateLimiter wrongCodesByMember;

    public AttendanceService(AttendanceSessionRepository sessionRepository,
                             AttendanceRecordRepository recordRepository,
                             MemberRepository memberRepository,
                             Clock clock) {
        this.sessionRepository = sessionRepository;
        this.recordRepository = recordRepository;
        this.memberRepository = memberRepository;
        this.clock = clock;
        this.wrongCodesByMember = new SlidingWindowRateLimiter(MAX_CHECK_IN_ATTEMPTS, CHECK_IN_ATTEMPT_WINDOW, clock);
    }

    /** The recent sessions. {@code manager} decides whether the codes of open sessions are included. */
    @Transactional(readOnly = true)
    public List<AttendanceSessionResponse> list(String studentId, boolean manager) {
        Member member = requireMember(studentId);
        List<AttendanceSession> sessions = sessionRepository.findTop100ByOrderByOpenedAtDescIdDesc();
        if (sessions.isEmpty()) return List.of();
        Map<Long, List<AttendanceRecord>> bySession = recordRepository
                .findBySessionIdIn(sessions.stream().map(AttendanceSession::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(AttendanceRecord::getSessionId));
        LocalDateTime now = LocalDateTime.now(clock);
        return sessions.stream()
                .map(session -> toResponse(session, bySession.getOrDefault(session.getId(), List.of()), member, manager, now))
                .toList();
    }

    public AttendanceSessionResponse open(AttendanceOpenRequest request, String studentId) {
        Member member = requireMember(studentId);
        String title = request.title() == null ? "" : request.title().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "출석 이름을 입력해 주세요.");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        AttendanceSession session = new AttendanceSession();
        session.setTitle(title);
        session.setCode(newCode(now));
        session.setOpenedByStudentId(member.getStudentId());
        session.setOpenedByName(displayName(member));
        session.setOpenedAt(now);
        session.setClosesAt(now.plusMinutes(request.minutes()));
        return toResponse(sessionRepository.save(session), List.of(), member, true, now);
    }

    @Transactional(readOnly = true)
    public AttendanceDetailResponse detail(Long id, String studentId) {
        Member member = requireMember(studentId);
        AttendanceSession session = requireSession(id);
        List<AttendanceRecord> records = recordRepository.findBySessionIdOrderByCheckedAtAscIdAsc(session.getId());
        return new AttendanceDetailResponse(
                toResponse(session, records, member, true, LocalDateTime.now(clock)),
                records.stream().map(r -> new AttendanceDetailResponse.Attendee(r.getMemberName(), r.getCheckedAt())).toList());
    }

    /**
     * Who attended how often across the recent sessions. Rows are grouped by member, so two
     * members who share a name stay two rows; the name shown is the one of the latest check-in.
     */
    @Transactional(readOnly = true)
    public AttendanceSummaryResponse summary(String studentId) {
        requireMember(studentId);
        List<AttendanceSession> sessions = sessionRepository.findTop100ByOrderByOpenedAtDescIdDesc();
        if (sessions.isEmpty()) return new AttendanceSummaryResponse(List.of(), List.of());
        List<AttendanceRecord> records = recordRepository
                .findBySessionIdIn(sessions.stream().map(AttendanceSession::getId).toList());
        Map<Long, Long> headCount = records.stream()
                .collect(Collectors.groupingBy(AttendanceRecord::getSessionId, Collectors.counting()));
        List<AttendanceSummaryResponse.SummaryMember> members = records.stream()
                .collect(Collectors.groupingBy(AttendanceRecord::getStudentId))
                .values().stream()
                .map(AttendanceService::toSummaryMember)
                .sorted(Comparator.comparingInt(AttendanceSummaryResponse.SummaryMember::count).reversed()
                        .thenComparing(AttendanceSummaryResponse.SummaryMember::name))
                .toList();
        return new AttendanceSummaryResponse(
                sessions.stream()
                        .map(session -> new AttendanceSummaryResponse.SummarySession(
                                session.getId(),
                                session.getTitle(),
                                session.getOpenedAt(),
                                headCount.getOrDefault(session.getId(), 0L).intValue()))
                        .toList(),
                members);
    }

    /** Stops check-in now. Closing a session that is already over changes nothing. */
    public AttendanceSessionResponse close(Long id, String studentId) {
        Member member = requireMember(studentId);
        AttendanceSession session = requireSession(id);
        LocalDateTime now = LocalDateTime.now(clock);
        if (session.isOpenAt(now)) {
            session.setClosedAt(now);
            sessionRepository.save(session);
        }
        return toResponse(session, recordRepository.findBySessionIdOrderByCheckedAtAscIdAsc(session.getId()), member, true, now);
    }

    public void delete(Long id) {
        AttendanceSession session = requireSession(id);
        recordRepository.deleteBySessionId(session.getId());
        sessionRepository.delete(session);
    }

    /**
     * A member checks in with the code on the screen. Checking in twice is harmless: the second
     * time reports the first. A wrong code, or one whose session is over, is refused the same
     * way, and counts toward the member's limit of wrong tries.
     */
    public AttendanceCheckInResponse checkIn(String rawCode, String studentId) {
        Member member = requireMember(studentId);
        String key = member.getStudentId();
        if (wrongCodesByMember.isExhausted(key)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "코드를 여러 번 잘못 입력했습니다. 5분 뒤에 다시 시도해 주세요.");
        }
        String code = rawCode == null ? "" : rawCode.replaceAll("\\s+", "");
        LocalDateTime now = LocalDateTime.now(clock);
        AttendanceSession session = sessionRepository.findByClosedAtIsNullAndClosesAtAfter(now).stream()
                .filter(open -> open.getCode().equals(code))
                .findFirst()
                .orElse(null);
        if (session == null) {
            wrongCodesByMember.tryAcquire(key);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "코드가 맞지 않거나 출석이 마감되었습니다.");
        }
        AttendanceRecord existing = recordRepository.findBySessionIdOrderByCheckedAtAscIdAsc(session.getId()).stream()
                .filter(record -> record.getStudentId().equals(member.getStudentId()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            return new AttendanceCheckInResponse(session.getId(), session.getTitle(), existing.getCheckedAt(), true);
        }
        AttendanceRecord record = new AttendanceRecord();
        record.setSessionId(session.getId());
        record.setStudentId(member.getStudentId());
        record.setMemberName(displayName(member));
        record.setCheckedAt(now);
        recordRepository.saveAndFlush(record);
        return new AttendanceCheckInResponse(session.getId(), session.getTitle(), now, false);
    }

    /**
     * Called when a member's account is removed: their check-ins go with the account. Sessions
     * they opened are the club's record of who attended, so those stay, without the opener's
     * identity.
     */
    public void deleteDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        recordRepository.deleteByStudentId(studentId);
        for (AttendanceSession session : sessionRepository.findByOpenedByStudentId(studentId)) {
            session.setOpenedByStudentId(REMOVED_MEMBER_ID);
            session.setOpenedByName(REMOVED_MEMBER_NAME);
            sessionRepository.save(session);
        }
    }

    private String newCode(LocalDateTime now) {
        Set<String> inUse = sessionRepository.findByClosedAtIsNullAndClosesAtAfter(now).stream()
                .map(AttendanceSession::getCode)
                .collect(Collectors.toSet());
        int bound = (int) Math.pow(10, CODE_LENGTH);
        for (int attempt = 0; attempt < 200; attempt++) {
            String code = String.format("%0" + CODE_LENGTH + "d", random.nextInt(bound));
            if (!inUse.contains(code)) return code;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "열려 있는 출석이 너무 많습니다. 끝난 출석을 마감한 뒤 다시 시도해 주세요.");
    }

    private Member requireMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private AttendanceSession requireSession(Long id) {
        return sessionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "출석을 찾을 수 없습니다."));
    }

    private static AttendanceSummaryResponse.SummaryMember toSummaryMember(List<AttendanceRecord> ofOneMember) {
        AttendanceRecord latest = ofOneMember.stream()
                .max(Comparator.comparing(AttendanceRecord::getCheckedAt).thenComparing(AttendanceRecord::getId))
                .orElseThrow();
        return new AttendanceSummaryResponse.SummaryMember(
                latest.getMemberName(),
                ofOneMember.size(),
                ofOneMember.stream().map(AttendanceRecord::getSessionId).sorted().toList());
    }

    private static String displayName(Member member) {
        String name = member.getName() == null ? "" : member.getName().trim();
        return name.isEmpty() ? "회원" : name;
    }

    private AttendanceSessionResponse toResponse(AttendanceSession session, List<AttendanceRecord> records,
                                                 Member member, boolean manager, LocalDateTime now) {
        boolean open = session.isOpenAt(now);
        // What the list shows as the end: the moment it was closed by hand, or the planned end.
        LocalDateTime end = session.getClosedAt() != null ? session.getClosedAt() : session.getClosesAt();
        return new AttendanceSessionResponse(
                session.getId(),
                session.getTitle(),
                session.getOpenedByName(),
                session.getOpenedAt(),
                end,
                open,
                open ? Math.max(0, Duration.between(now, session.getClosesAt()).getSeconds()) : 0,
                records.size(),
                records.stream().anyMatch(record -> record.getStudentId().equals(member.getStudentId())),
                manager && open ? session.getCode() : null
        );
    }
}
