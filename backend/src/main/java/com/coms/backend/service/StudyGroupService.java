package com.coms.backend.service;

import com.coms.backend.domain.*;
import com.coms.backend.dto.StudyGroupDto.*;
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
public class StudyGroupService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Set<String> DAYS = Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN");
    private static final Set<String> BANDS = Set.of("MORNING", "AFTERNOON", "EVENING", "NIGHT");
    private final StudyGroupRepository groups;
    private final StudyGroupMemberRepository memberships;
    private final StudyInterestRepository interests;
    private final MemberRepository members;
    private final StudyAccessService access;
    private final PermissionService permissions;
    private final NotificationService notifications;
    private final Clock clock;

    public StudyGroupService(StudyGroupRepository groups, StudyGroupMemberRepository memberships,
                             StudyInterestRepository interests, MemberRepository members,
                             StudyAccessService access, PermissionService permissions,
                             NotificationService notifications, Clock clock) {
        this.groups = groups;
        this.memberships = memberships;
        this.interests = interests;
        this.members = members;
        this.access = access;
        this.permissions = permissions;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Card> list(String actorId, String sort) {
        boolean signedIn = actorId != null && members.existsByStudentId(actorId);
        List<StudyGroup> visible = groups.findAllByOrderByCreatedAtDescIdDesc().stream()
                .filter(g -> signedIn || g.getStatus() == StudyGroup.Status.RECRUITING || g.getStatus() == StudyGroup.Status.ACTIVE)
                .toList();
        Map<String, String> names = names(visible.stream().map(StudyGroup::getLeaderStudentId).filter(Objects::nonNull).toList());
        List<Card> result = visible.stream().map(g -> card(g, names, signedIn)).toList();
        if (!signedIn || !"interest".equals(sort)) return result;
        return result.stream().sorted(Comparator.comparingLong((Card c) -> c.interestCount() == null ? 0 : c.interestCount()).reversed().thenComparing(Card::id)).toList();
    }

    @Transactional(readOnly = true)
    public View view(Long id, String actorId) {
        StudyGroup group = access.requireGroup(id);
        boolean manager = access.isManager(id, actorId);
        StudyGroupMember membership = memberships.findByGroupIdAndStudentId(id, actorId).orElse(null);
        StudyInterest own = interests.findByGroupIdAndStudentId(id, actorId).orElse(null);
        InterestSummary summary = interestSummary(id, manager);
        return new View(group.getId(), group.getName(), group.getDescription(), tags(group.getTopicTags()),
                group.getLeaderStudentId(), group.getLeaderStudentId() == null ? "리더 없음" : name(group.getLeaderStudentId()),
                group.getTerm(), group.getSchedule(), group.getPlace(),
                group.getCapacity(), group.getStatus(), group.getCreatedBy(), group.getCreatedAt(), group.getUpdatedAt(),
                summary.total(), summary, membership == null ? null : memberView(membership, name(actorId)),
                own == null ? null : new InterestOwn(slots(own.getPreferredSlots()), own.getLevel()), manager, group.getVersion());
    }

    public View create(Write write, String actorId, boolean direct) {
        String leaderId = direct && write.leaderStudentId() != null && !write.leaderStudentId().isBlank()
                ? write.leaderStudentId().trim() : actorId;
        if (direct && !leaderId.equals(actorId)) requireActivityWrite(access.requireMember(actorId));
        Member leaderAccount = lockLeaderAccount(leaderId);
        if (direct && leaderId.equals(actorId)) requireActivityWrite(leaderAccount);
        requireFullMember(leaderAccount);
        StudyGroup group = new StudyGroup();
        applyWrite(group, write);
        group.setLeaderStudentId(leaderAccount.getStudentId());
        group.setCreatedBy(actorId);
        group.setStatus(direct ? StudyGroup.Status.RECRUITING : StudyGroup.Status.PROPOSED);
        group = groups.saveAndFlush(group);
        StudyGroupMember leader = new StudyGroupMember();
        leader.setGroupId(group.getId());
        leader.setStudentId(leaderAccount.getStudentId());
        leader.setRole(StudyGroupMember.Role.LEADER);
        leader.setStatus(StudyGroupMember.Status.APPROVED);
        leader.setJoinedAt(LocalDateTime.now(clock));
        memberships.save(leader);
        return view(group.getId(), actorId);
    }

    public View update(Long id, Write write, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireManager(id, actorId);
        if (group.getStatus() == StudyGroup.Status.ENDED) throw conflict("종료된 스터디는 수정할 수 없습니다.");
        if (write.version() == null || write.version() != group.getVersion()) {
            throw conflict("스터디 정보가 변경되었습니다. 새로고침한 뒤 다시 수정해 주세요.");
        }
        applyWrite(group, write);
        if (group.getCapacity() != null && group.getCapacity() < memberships.countByGroupIdAndStatus(id, StudyGroupMember.Status.APPROVED))
            throw conflict("현재 승인된 인원보다 정원을 낮출 수 없습니다.");
        return view(groups.saveAndFlush(group).getId(), actorId);
    }

    public View approve(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        requireActivityWrite(access.requireMember(actorId));
        if (group.getStatus() != StudyGroup.Status.PROPOSED) throw conflict("제안 상태의 스터디만 승인할 수 있습니다.");
        group.setStatus(StudyGroup.Status.RECRUITING);
        return view(groups.saveAndFlush(group).getId(), actorId);
    }

    public View activate(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireManager(id, actorId);
        if (group.getStatus() != StudyGroup.Status.RECRUITING) throw conflict("모집 중인 스터디만 시작할 수 있습니다.");
        group.setStatus(StudyGroup.Status.ACTIVE);
        return view(groups.saveAndFlush(group).getId(), actorId);
    }

    public View end(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        requireActivityWrite(access.requireMember(actorId));
        if (group.getStatus() == StudyGroup.Status.ENDED) throw conflict("이미 종료된 스터디입니다.");
        group.setStatus(StudyGroup.Status.ENDED);
        return view(groups.saveAndFlush(group).getId(), actorId);
    }

    public View appointLeader(Long id, String newLeaderId, String actorId) {
        if (!newLeaderId.equals(actorId)) requireActivityWrite(access.requireMember(actorId));
        Member next = lockLeaderAccount(newLeaderId);
        if (newLeaderId.equals(actorId)) requireActivityWrite(next);
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        requireFullMember(next);
        String previousLeaderId = group.getLeaderStudentId();
        if (group.getStatus() == StudyGroup.Status.ENDED && previousLeaderId != null) throw conflict("종료된 스터디입니다.");
        if (newLeaderId.equals(previousLeaderId)) return view(id, actorId);
        StudyGroupMember old = previousLeaderId == null ? null : memberships.findByGroupIdAndStudentId(id, previousLeaderId)
                .orElseThrow(() -> conflict("기존 리더 정보가 없습니다."));
        StudyGroupMember candidate = memberships.findByGroupIdAndStudentId(id, newLeaderId).orElse(null);
        if (candidate == null) {
            checkCapacity(group);
            candidate = new StudyGroupMember();
            candidate.setGroupId(id);
            candidate.setStudentId(newLeaderId);
        } else if (candidate.getStatus() != StudyGroupMember.Status.APPROVED) {
            checkCapacity(group);
        }
        if (candidate.getStatus() != StudyGroupMember.Status.APPROVED) candidate.setJoinedAt(LocalDateTime.now(clock));
        candidate.setStatus(StudyGroupMember.Status.APPROVED);
        candidate.setRole(StudyGroupMember.Role.LEADER);
        if (old != null) old.setRole(StudyGroupMember.Role.MEMBER);
        memberships.save(candidate);
        group.setLeaderStudentId(newLeaderId);
        groups.saveAndFlush(group);
        return view(id, actorId);
    }

    public MemberView join(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        Member actor = access.requireMember(actorId);
        requireFullMember(actor);
        if (group.getStatus() != StudyGroup.Status.RECRUITING && group.getStatus() != StudyGroup.Status.ACTIVE)
            throw conflict("현재 가입 신청을 받지 않습니다.");
        if (memberships.findByGroupIdAndStudentId(id, actorId).isPresent()) throw conflict("이미 가입하거나 신청한 스터디입니다.");
        StudyGroupMember row = new StudyGroupMember();
        row.setGroupId(id);
        row.setStudentId(actorId);
        row.setJoinedAt(LocalDateTime.now(clock));
        memberships.saveAndFlush(row);
        notifications.notifyStudy(group.getLeaderStudentId(), actorId, id, actor.getName() + "님이 스터디 가입을 신청했습니다.");
        return memberView(row, actor.getName());
    }

    public void leave(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        if (actorId.equals(group.getLeaderStudentId())) throw conflict("리더를 교체한 뒤 탈퇴할 수 있습니다.");
        StudyGroupMember row = memberships.findByGroupIdAndStudentId(id, actorId).orElseThrow(() -> notFound());
        memberships.delete(row);
    }

    @Transactional(readOnly = true)
    public List<MemberView> memberList(Long id, String actorId) {
        boolean manager = access.isManager(id, actorId);
        if (!manager) access.requireParticipant(id, actorId);
        List<StudyGroupMember> rows = memberships.findByGroupIdOrderByJoinedAtAscIdAsc(id).stream()
                .filter(row -> manager || row.getStatus() == StudyGroupMember.Status.APPROVED).toList();
        Map<String, String> names = names(rows.stream().map(StudyGroupMember::getStudentId).toList());
        return rows.stream().map(row -> memberView(row, names.get(row.getStudentId()))).toList();
    }

    public MemberView decideMember(Long id, String studentId, boolean approved, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireManager(id, actorId);
        if (group.getStatus() == StudyGroup.Status.ENDED) throw conflict("종료된 스터디입니다.");
        StudyGroupMember row = memberships.findByGroupIdAndStudentId(id, studentId).orElseThrow(() -> notFound());
        if (row.getRole() == StudyGroupMember.Role.LEADER) throw conflict("리더의 가입 상태는 변경할 수 없습니다.");
        if (row.getStatus() != StudyGroupMember.Status.PENDING) throw conflict("대기 중인 신청만 처리할 수 있습니다.");
        if (!approved) {
            memberships.delete(row);
            notifications.notifyStudy(studentId, actorId, id, "스터디 가입 신청 결과를 확인해 주세요.");
            return null;
        }
        requireFullMember(access.requireMember(studentId));
        checkCapacity(group);
        row.setStatus(StudyGroupMember.Status.APPROVED);
        row.setJoinedAt(LocalDateTime.now(clock));
        notifications.notifyStudy(studentId, actorId, id, "스터디 가입 신청이 승인되었습니다.");
        return memberView(memberships.save(row), name(studentId));
    }

    public void removeMember(Long id, String studentId, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireManager(id, actorId);
        if (studentId.equals(group.getLeaderStudentId())) throw conflict("리더를 교체한 뒤 제거할 수 있습니다.");
        memberships.findByGroupIdAndStudentId(id, studentId).ifPresent(memberships::delete);
    }

    @Transactional(readOnly = true)
    public InterestSummary interest(Long id, String actorId) {
        access.requireGroup(id);
        return interestSummary(id, access.isManager(id, actorId));
    }

    public InterestOwn setInterest(Long id, InterestWrite write, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireMember(actorId);
        if (group.getStatus() != StudyGroup.Status.PROPOSED && group.getStatus() != StudyGroup.Status.RECRUITING)
            throw conflict("관심 조사가 마감되었습니다.");
        if (write == null) throw badRequest("관심 정보를 입력해 주세요.");
        List<String> requested = write.slots() == null ? List.of() : write.slots();
        if (requested.size() > 28) throw badRequest("선호 시간은 28개 이하로 선택해 주세요.");
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String slot : requested) {
            if (slot == null) throw badRequest("선호 시간 형식이 올바르지 않습니다.");
            String[] parts = slot.split("_", -1);
            if (parts.length != 2 || !DAYS.contains(parts[0]) || !BANDS.contains(parts[1]))
                throw badRequest("선호 시간 형식이 올바르지 않습니다.");
            unique.add(slot);
        }
        StudyInterest row = interests.findByGroupIdAndStudentId(id, actorId).orElseGet(() -> {
            StudyInterest next = new StudyInterest();
            next.setGroupId(id);
            next.setStudentId(actorId);
            return next;
        });
        row.setPreferredSlots(String.join(",", unique));
        row.setLevel(write.level());
        interests.save(row);
        return new InterestOwn(List.copyOf(unique), write.level());
    }

    public void clearInterest(Long id, String actorId) {
        StudyGroup group = groups.findByIdForUpdate(id).orElseThrow(() -> notFound());
        access.requireMember(actorId);
        if (group.getStatus() != StudyGroup.Status.PROPOSED && group.getStatus() != StudyGroup.Status.RECRUITING)
            throw conflict("관심 조사가 마감되었습니다.");
        interests.deleteByGroupIdAndStudentId(id, actorId);
    }

    /** Erase account-linked participation while retaining the group's historical record. */
    public void deleteDataForMember(String studentId) {
        if (studentId == null || studentId.isBlank()) return;
        List<StudyGroup> affected = groups.findAccountGroupsForUpdate(studentId);
        interests.deleteByStudentId(studentId);
        memberships.deleteByStudentId(studentId);
        for (StudyGroup group : affected) {
            if (studentId.equals(group.getLeaderStudentId())) {
                group.setLeaderStudentId(null);
                group.setStatus(StudyGroup.Status.ENDED);
            }
            if (studentId.equals(group.getCreatedBy())) group.setCreatedBy("removed");
        }
    }

    private Member lockLeaderAccount(String studentId) {
        return members.findWithLockByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "리더로 지정할 회원을 찾을 수 없습니다."));
    }

    private InterestSummary interestSummary(Long id, boolean manager) {
        List<StudyInterest> rows = interests.findByGroupId(id);
        Map<String, Long> slotCounts = rows.stream().flatMap(row -> slots(row.getPreferredSlots()).stream())
                .collect(Collectors.groupingBy(String::valueOf, TreeMap::new, Collectors.counting()));
        Map<String, Long> levelCounts = rows.stream().map(StudyInterest::getLevel).filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Enum::name, TreeMap::new, Collectors.counting()));
        List<InterestName> names = null;
        if (manager) {
            Map<String, String> display = names(rows.stream().map(StudyInterest::getStudentId).toList());
            names = rows.stream().map(row -> new InterestName(row.getStudentId(), display.get(row.getStudentId()))).toList();
        }
        return new InterestSummary(rows.size(), slotCounts, levelCounts, names);
    }

    private Card card(StudyGroup group, Map<String, String> leaderNames, boolean signedIn) {
        String leaderId = group.getLeaderStudentId();
        String leaderName = leaderId == null ? "리더 없음" : leaderNames.getOrDefault(leaderId, "탈퇴한 회원");
        return new Card(group.getId(), group.getName(), tags(group.getTopicTags()), group.getSchedule(),
                leaderName, group.getStatus(), signedIn ? interests.countByGroupId(group.getId()) : null);
    }

    private void applyWrite(StudyGroup group, Write write) {
        if (write == null) throw badRequest("스터디 정보를 입력해 주세요.");
        group.setName(text(write.name(), 120, true));
        group.setDescription(text(write.description(), 5000, false));
        List<String> tags = write.topicTags() == null ? List.of() : write.topicTags();
        if (tags.size() > 10) throw badRequest("주제 태그는 10개 이하로 입력해 주세요.");
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String tag : tags) {
            String normalized = text(tag, 40, true);
            if (normalized.contains(",")) throw badRequest("주제 태그에 쉼표를 사용할 수 없습니다.");
            unique.add(normalized);
        }
        String tagText = String.join(",", unique);
        if (tagText.length() > 500) throw badRequest("주제 태그가 너무 깁니다.");
        group.setTopicTags(tagText);
        String term = write.term() == null || write.term().isBlank()
                ? ClubActivityTimelineStatus.term(LocalDate.now(clock.withZone(SEOUL))) : text(write.term(), 40, true);
        if (!term.matches("[0-9]{4} (1학기|여름방학|2학기|겨울방학)")) throw badRequest("학기가 올바르지 않습니다.");
        group.setTerm(term);
        group.setSchedule(text(write.schedule(), 200, false));
        group.setPlace(text(write.place(), 200, false));
        if (write.capacity() != null && write.capacity() < 1) throw badRequest("정원은 1명 이상이어야 합니다.");
        group.setCapacity(write.capacity());
    }

    private static String text(String value, int max, boolean required) {
        String result = value == null ? "" : value.trim();
        if (required && result.isEmpty()) throw badRequest("필수 항목을 입력해 주세요.");
        if (result.length() > max) throw badRequest("입력한 내용이 너무 깁니다.");
        return result.isEmpty() ? null : result;
    }

    private void checkCapacity(StudyGroup group) {
        if (group.getCapacity() != null && memberships.countByGroupIdAndStatus(group.getId(), StudyGroupMember.Status.APPROVED) >= group.getCapacity())
            throw conflict("스터디 정원이 찼습니다.");
    }

    private void requireActivityWrite(Member actor) {
        if (!permissions.has(actor, Permission.ACTIVITY_WRITE)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "활동 관리 권한이 없습니다.");
    }

    private static void requireFullMember(Member actor) {
        if (!actor.getRole().isAtLeast(Member.Role.USER)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "정회원부터 스터디에 가입하거나 스터디를 제안하고 리더를 맡을 수 있습니다.");
    }

    private String name(String studentId) { return members.findByStudentId(studentId).map(Member::getName).orElse("탈퇴한 회원"); }
    private Map<String, String> names(List<String> ids) {
        if (ids.isEmpty()) return Map.of();
        return members.findByStudentIdIn(ids).stream().collect(Collectors.toMap(Member::getStudentId, Member::getName));
    }
    private static MemberView memberView(StudyGroupMember row, String name) {
        return new MemberView(row.getStudentId(), name, row.getRole(), row.getStatus(), row.getJoinedAt());
    }
    private static List<String> tags(String raw) { return raw == null || raw.isBlank() ? List.of() : List.of(raw.split(",")); }
    private static List<String> slots(String raw) { return raw == null || raw.isBlank() ? List.of() : List.of(raw.split(",")); }
    private static ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디를 찾을 수 없습니다."); }
}
