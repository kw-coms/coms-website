package com.coms.backend.service;

import com.coms.backend.domain.*;
import com.coms.backend.dto.StudyAttendanceDto;
import com.coms.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class StudyAttendanceService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final StudySessionRepository sessions;
    private final AttendanceSessionRepository attendanceSessions;
    private final AttendanceRecordRepository records;
    private final MemberRepository members;
    private final StudyAccessService access;
    private final AttendanceService attendance;
    private final NotificationService notifications;
    private final Clock clock;

    public StudyAttendanceService(StudySessionRepository sessions,
                                  AttendanceSessionRepository attendanceSessions, AttendanceRecordRepository records,
                                  MemberRepository members, StudyAccessService access, AttendanceService attendance,
                                  NotificationService notifications, Clock clock) {
        this.sessions = sessions;
        this.attendanceSessions = attendanceSessions;
        this.records = records;
        this.members = members;
        this.access = access;
        this.attendance = attendance;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<StudyAttendanceDto.Session> list(Long groupId, String actor) {
        StudyGroup group = access.requireGroup(groupId);
        boolean manager = access.requireParticipantAndCheckManager(group, actor);
        return sessions.findByGroupIdOrderByRoundNoAsc(groupId).stream().map(round -> view(round, group, manager)).toList();
    }

    @Transactional(readOnly = true)
    public StudyAttendanceDto.Session get(Long groupId, Long sessionId, String actor) {
        StudyGroup group = access.requireGroup(groupId);
        boolean manager = access.requireParticipantAndCheckManager(group, actor);
        return view(require(groupId, sessionId), group, manager);
    }

    public StudyAttendanceDto.Session create(Long groupId, StudyAttendanceDto.Write write, String actor) {
        StudyGroup group = lockGroupForRoundChanges(groupId, actor);
        int next = sessions.findTopByGroupIdOrderByRoundNoDesc(groupId).map(s -> s.getRoundNo() + 1).orElse(1);
        StudySession session = new StudySession();
        session.setGroupId(groupId);
        session.setRoundNo(next);
        apply(session, write);
        return view(sessions.save(session), group, true);
    }

    public StudyAttendanceDto.Session edit(Long groupId, Long sessionId, StudyAttendanceDto.Write write, String actor) {
        StudyGroup group = lockGroupForRoundChanges(groupId, actor);
        StudySession session = require(groupId, sessionId);
        if (write.date().isAfter(LocalDate.now(clock.withZone(SEOUL))) && attendanceSessions.existsByStudySessionId(sessionId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "출석을 시작한 회차는 미래 날짜로 옮길 수 없습니다.");
        }
        apply(session, write);
        return view(session, group, true);
    }

    public StudyAttendanceDto.Session open(Long groupId, Long sessionId, StudyAttendanceDto.Open request, String actor) {
        StudyGroup group = lockGroupForRoundChanges(groupId, actor);
        StudySession round = require(groupId, sessionId);
        requireAttendanceDate(round);
        attendance.openStudy(round.getId(), attendanceTitle(group, round), request.minutes(), actor);
        for (StudyGroupMember member : access.approvedMembers(groupId)) {
            if (!member.getStudentId().equals(actor)) {
                notifications.notifyStudy(member.getStudentId(), actor, groupId, group.getName() + " " + round.getRoundNo() + "회 출석이 열렸습니다.");
            }
        }
        return view(round, group, true);
    }

    public StudyAttendanceDto.Session close(Long groupId, Long sessionId, String actor) {
        access.lockGroup(groupId);
        StudyGroup group = access.requireManager(groupId, actor);
        StudySession round = require(groupId, sessionId);
        AttendanceSession session = attendanceSessions.findByStudySessionId(round.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "열린 출석이 없습니다."));
        if (session.isOpenAt(LocalDateTime.now(clock))) session.setClosedAt(LocalDateTime.now(clock));
        return view(round, group, true);
    }

    public StudyAttendanceDto.Roster mark(Long groupId, Long sessionId, String studentId,
                                          StudyAttendanceDto.Mark mark, String actor) {
        StudyGroup group = access.lockGroup(groupId);
        access.requireManager(groupId, actor);
        StudySession round = require(groupId, sessionId);
        requireAttendanceDate(round);
        if (!access.isApprovedMember(groupId, studentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "승인된 스터디 멤버만 출석 처리할 수 있습니다.");
        }
        AttendanceSession check = attendanceSessions.findByStudySessionId(round.getId())
                .orElseGet(() -> attendance.startManualStudy(round.getId(), attendanceTitle(group, round), actor));
        Member member = access.requireMember(studentId);
        AttendanceRecord row = records.findBySessionIdAndStudentId(check.getId(), studentId).orElseGet(AttendanceRecord::new);
        row.setSessionId(check.getId());
        row.setStudentId(studentId);
        row.setMemberName(member.getName());
        row.setStatus(mark.status());
        row.setSource(AttendanceRecord.Source.MANUAL);
        row.setCheckedAt(mark.status() == AttendanceRecord.Status.ABSENT ? null : LocalDateTime.now(clock));
        records.save(row);
        return roster(groupId, sessionId, actor);
    }

    @Transactional(readOnly = true)
    public StudyAttendanceDto.Roster roster(Long groupId, Long sessionId, String actor) {
        access.requireParticipant(groupId, actor);
        StudySession round = require(groupId, sessionId);
        Optional<AttendanceSession> check = attendanceSessions.findByStudySessionId(round.getId());
        Map<String, AttendanceRecord> recorded = check.map(s -> records.findBySessionIdOrderByCheckedAtAscIdAsc(s.getId()).stream()
                .collect(Collectors.toMap(AttendanceRecord::getStudentId, r -> r)))
                .orElse(Map.of());
        List<StudyGroupMember> approved = access.approvedMembers(groupId);
        Map<String, Member> people = members.findByStudentIdIn(approved.stream().map(StudyGroupMember::getStudentId).toList())
                .stream().collect(Collectors.toMap(Member::getStudentId, m -> m));
        List<StudyAttendanceDto.RosterRow> rows = new ArrayList<>(approved.stream().map(m -> {
            AttendanceRecord r = recorded.get(m.getStudentId());
            Member person = people.get(m.getStudentId());
            return new StudyAttendanceDto.RosterRow(m.getStudentId(), person == null ? "탈퇴한 회원" : person.getName(),
                    r == null ? null : r.getStatus(), r == null ? null : r.getSource(), r == null ? null : r.getCheckedAt(), true);
        }).toList());
        Set<String> currentIds = approved.stream().map(StudyGroupMember::getStudentId).collect(Collectors.toSet());
        recorded.values().stream().filter(r -> !currentIds.contains(r.getStudentId()))
                .sorted(Comparator.comparing(AttendanceRecord::getStudentId))
                .forEach(r -> rows.add(new StudyAttendanceDto.RosterRow(r.getStudentId(), r.getMemberName(),
                        r.getStatus(), r.getSource(), r.getCheckedAt(), false)));
        return new StudyAttendanceDto.Roster(rows);
    }

    @Transactional(readOnly = true)
    public List<StudyAttendanceDto.Rate> rates(Long groupId, String actor) {
        access.requireManager(groupId, actor);
        List<StudySession> rounds = sessions.findByGroupIdOrderByRoundNoAsc(groupId);
        Map<Long, AttendanceSession> opened = attendanceSessions.findByStudySessionIdIn(rounds.stream().map(StudySession::getId).toList())
                .stream().collect(Collectors.toMap(AttendanceSession::getStudySessionId, s -> s));
        Map<Long, List<AttendanceRecord>> bySession = records.findBySessionIdIn(opened.values().stream().map(AttendanceSession::getId).toList())
                .stream().collect(Collectors.groupingBy(AttendanceRecord::getSessionId));
        List<StudyGroupMember> approved = access.approvedMembers(groupId);
        Map<String, Member> people = members.findByStudentIdIn(approved.stream().map(StudyGroupMember::getStudentId).toList())
                .stream().collect(Collectors.toMap(Member::getStudentId, m -> m));
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = LocalDate.now(clock.withZone(SEOUL));
        return approved.stream().map(member -> {
            int eligible = 0, attended = 0;
            for (StudySession round : rounds) {
                AttendanceSession check = opened.get(round.getId());
                if (check == null || round.getDate().isAfter(today)
                        || check.getFirstOpenedAt().isAfter(now)
                        || member.getJoinedAt().isAfter(check.getFirstOpenedAt())) continue;
                eligible++;
                if (bySession.getOrDefault(check.getId(), List.of()).stream().anyMatch(r ->
                        r.getStudentId().equals(member.getStudentId()) && r.getStatus() != AttendanceRecord.Status.ABSENT)) attended++;
            }
            Member person = people.get(member.getStudentId());
            return new StudyAttendanceDto.Rate(member.getStudentId(), person == null ? "탈퇴한 회원" : person.getName(),
                    attended, eligible, eligible == 0 ? 0 : (double) attended / eligible);
        }).toList();
    }

    @Transactional(readOnly = true)
    public String ratesCsv(Long groupId, String actor) {
        StringBuilder csv = new StringBuilder("studentId,name,attended,eligible,rate\r\n");
        for (StudyAttendanceDto.Rate rate : rates(groupId, actor)) {
            csv.append(csvCell(rate.studentId())).append(',').append(csvCell(rate.name())).append(',')
                    .append(rate.attended()).append(',').append(rate.eligible()).append(',')
                    .append(String.format(Locale.ROOT, "%.1f%%", rate.rate() * 100)).append("\r\n");
        }
        return csv.toString();
    }

    private static String csvCell(String value) {
        String safe = value == null ? "" : value.replace("\"", "\"\"").replace('\n', ' ').replace('\r', ' ');
        if (!safe.isEmpty() && "=+-@\t".indexOf(safe.charAt(0)) >= 0) safe = "'" + safe;
        return '"' + safe + '"';
    }

    private void apply(StudySession session, StudyAttendanceDto.Write write) {
        session.setDate(write.date());
        session.setTopic(write.topic().trim());
        session.setNotes(write.notes() == null ? null : write.notes().trim());
    }

    private StudyGroup lockGroupForRoundChanges(Long groupId, String actor) {
        StudyGroup group = access.lockGroup(groupId);
        access.requireManager(groupId, actor);
        if (group.getStatus() != StudyGroup.Status.RECRUITING && group.getStatus() != StudyGroup.Status.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "모집 중이거나 진행 중인 스터디에서만 회차를 수정하거나 출석을 열 수 있습니다.");
        }
        return group;
    }

    private StudySession require(Long groupId, Long id) {
        return sessions.findByIdAndGroupId(id, groupId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디 회차를 찾을 수 없습니다."));
    }

    private void requireAttendanceDate(StudySession round) {
        if (round.getDate().isAfter(LocalDate.now(clock.withZone(SEOUL)))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "미래 회차에는 출석을 처리할 수 없습니다.");
        }
    }

    private static String attendanceTitle(StudyGroup group, StudySession round) {
        String suffix = " " + round.getRoundNo() + "회";
        String name = group.getName();
        int end = Math.min(name.length(), 100 - suffix.length());
        if (end < name.length() && Character.isHighSurrogate(name.charAt(end - 1))) end--;
        return name.substring(0, end) + suffix;
    }

    private StudyAttendanceDto.Session view(StudySession round, StudyGroup group, boolean manager) {
        AttendanceSession check = attendanceSessions.findByStudySessionId(round.getId()).orElse(null);
        boolean open = check != null && check.isOpenAt(LocalDateTime.now(clock))
                && group.getStatus() != StudyGroup.Status.ENDED;
        return new StudyAttendanceDto.Session(round.getId(), round.getGroupId(), round.getRoundNo(), round.getDate(), round.getTopic(),
                round.getNotes(), check == null ? null : check.getId(), open,
                open && manager ? check.getCode() : null);
    }
}
