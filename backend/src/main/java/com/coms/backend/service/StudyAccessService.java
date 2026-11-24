package com.coms.backend.service;

import com.coms.backend.domain.*;
import com.coms.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class StudyAccessService {
    private final StudyGroupRepository groups;
    private final StudyGroupMemberRepository members;
    private final MemberRepository accounts;
    private final PermissionService permissions;

    public StudyAccessService(StudyGroupRepository groups, StudyGroupMemberRepository members,
                              MemberRepository accounts, PermissionService permissions) {
        this.groups = groups;
        this.members = members;
        this.accounts = accounts;
        this.permissions = permissions;
    }

    public StudyGroup requireGroup(Long id) {
        return groups.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디를 찾을 수 없습니다."));
    }

    StudyGroup lockGroup(Long id) {
        return groups.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "스터디를 찾을 수 없습니다."));
    }

    public Member requireMember(String studentId) {
        return accounts.findByStudentId(studentId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    public boolean isManager(Long groupId, String studentId) {
        if (studentId == null) return false;
        StudyGroup group = requireGroup(groupId);
        Member actor = requireMember(studentId);
        boolean leader = group.getLeaderStudentId().equals(studentId) && actor.getRole().isAtLeast(Member.Role.USER);
        return leader || permissions.has(actor, Permission.ACTIVITY_WRITE);
    }

    public StudyGroup requireManager(Long groupId, String studentId) {
        StudyGroup group = requireGroup(groupId);
        if (!isManager(groupId, studentId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "스터디 관리 권한이 없습니다.");
        return group;
    }

    public boolean isApprovedMember(Long groupId, String studentId) {
        return studentId != null && members.findByGroupIdAndStudentId(groupId, studentId)
                .map(row -> row.getStatus() == StudyGroupMember.Status.APPROVED).orElse(false);
    }

    public boolean canReadMaterials(Long groupId, String studentId) {
        if (studentId == null) return false;
        return isApprovedMember(groupId, studentId) || isManager(groupId, studentId);
    }

    public StudyGroup requireParticipant(Long groupId, String studentId) {
        StudyGroup group = requireGroup(groupId);
        if (!canReadMaterials(groupId, studentId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "승인된 스터디 멤버만 볼 수 있습니다.");
        return group;
    }

    public List<StudyGroupMember> approvedMembers(Long groupId) {
        return members.findByGroupIdAndStatus(groupId, StudyGroupMember.Status.APPROVED);
    }
}
