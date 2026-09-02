package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.LoginAuditResponse;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.repository.ArchiveFileVoteRepository;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.ClubEventRsvpRepository;
import com.coms.backend.repository.ClubEventVoteRepository;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MiniAppDocumentRepository;
import com.coms.backend.repository.MobilePushTokenRepository;
import com.coms.backend.repository.NoticeVoteRepository;
import com.coms.backend.repository.NotificationPreferenceRepository;
import com.coms.backend.repository.NotificationRepository;
import com.coms.backend.repository.RecruitApplicationRepository;
import com.coms.backend.repository.TeamRandomizerRoomRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class AdminService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final CommunityService communityService;
    private final NoticeVoteRepository noticeVoteRepository;
    private final ClubActivityVoteRepository clubActivityVoteRepository;
    private final ClubEventVoteRepository clubEventVoteRepository;
    private final ClubEventRsvpRepository clubEventRsvpRepository;
    private final ArchiveFileVoteRepository archiveFileVoteRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final MobilePushTokenRepository mobilePushTokenRepository;
    private final MiniAppDocumentRepository miniAppDocumentRepository;
    private final TeamRandomizerRoomRepository teamRandomizerRoomRepository;
    private final RecruitApplicationRepository recruitApplicationRepository;
    private final LoginFailureRepository loginFailureRepository;

    public AdminService(MemberRepository memberRepository, PasswordEncoder passwordEncoder, CommunityService communityService,
                        NoticeVoteRepository noticeVoteRepository, ClubActivityVoteRepository clubActivityVoteRepository,
                        ClubEventVoteRepository clubEventVoteRepository, ClubEventRsvpRepository clubEventRsvpRepository,
                        ArchiveFileVoteRepository archiveFileVoteRepository, NotificationRepository notificationRepository,
                        NotificationPreferenceRepository notificationPreferenceRepository,
                        MobilePushTokenRepository mobilePushTokenRepository, MiniAppDocumentRepository miniAppDocumentRepository,
                        TeamRandomizerRoomRepository teamRandomizerRoomRepository,
                        RecruitApplicationRepository recruitApplicationRepository,
                        LoginFailureRepository loginFailureRepository) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.communityService = communityService;
        this.noticeVoteRepository = noticeVoteRepository;
        this.clubActivityVoteRepository = clubActivityVoteRepository;
        this.clubEventVoteRepository = clubEventVoteRepository;
        this.clubEventRsvpRepository = clubEventRsvpRepository;
        this.archiveFileVoteRepository = archiveFileVoteRepository;
        this.notificationRepository = notificationRepository;
        this.notificationPreferenceRepository = notificationPreferenceRepository;
        this.mobilePushTokenRepository = mobilePushTokenRepository;
        this.miniAppDocumentRepository = miniAppDocumentRepository;
        this.teamRandomizerRoomRepository = teamRandomizerRoomRepository;
        this.recruitApplicationRepository = recruitApplicationRepository;
        this.loginFailureRepository = loginFailureRepository;
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers() {
        return memberRepository.findAll().stream().map(this::toResponse).toList();
    }

    public MemberResponse updateRole(Long id, RoleUpdateRequest request) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Member.Role newRole;
        try {
            newRole = Member.Role.valueOf(request.role().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role.");
        }
        boolean demotingAdmin = member.getRole() == Member.Role.ADMIN && newRole != Member.Role.ADMIN;
        if (demotingAdmin && memberRepository.countByRole(Member.Role.ADMIN) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "마지막 관리자는 강등할 수 없습니다.");
        }
        member.setRole(newRole);
        return toResponse(memberRepository.save(member));
    }

    public DeletedMemberSnapshot deleteMember(Long id) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        ensureNotFinalAdmin(member, "마지막 관리자는 삭제할 수 없습니다.");
        DeletedMemberSnapshot snapshot = DeletedMemberSnapshot.from(member);
        purgePersonalDataForMember(member.getStudentId());
        memberRepository.delete(member);
        return snapshot;
    }

    public DeletedMemberSnapshot deleteByStudentId(String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        ensureNotFinalAdmin(member, "마지막 관리자는 탈퇴할 수 없습니다.");
        DeletedMemberSnapshot snapshot = DeletedMemberSnapshot.from(member);
        purgePersonalDataForMember(member.getStudentId());
        memberRepository.delete(member);
        return snapshot;
    }

    /**
     * Removes every piece of member data keyed by 학번 so a future signup with the same
     * student id cannot inherit the previous owner's notifications, documents, rooms, or
     * push tokens. Moderation/audit records (audit logs, promotion logs, deleted-post archive,
     * bans) are intentionally kept.
     */
    private void purgePersonalDataForMember(String studentId) {
        communityService.deleteCommunityDataForMember(studentId);
        noticeVoteRepository.deleteByStudentId(studentId);
        clubActivityVoteRepository.deleteByStudentId(studentId);
        clubEventVoteRepository.deleteByStudentId(studentId);
        clubEventRsvpRepository.deleteByStudentId(studentId);
        archiveFileVoteRepository.deleteByStudentId(studentId);
        notificationRepository.deleteByRecipientStudentId(studentId);
        notificationPreferenceRepository.deleteByMemberStudentId(studentId);
        mobilePushTokenRepository.deleteByMemberStudentId(studentId);
        miniAppDocumentRepository.deleteByOwnerStudentId(studentId);
        teamRandomizerRoomRepository.deleteByOwnerStudentId(studentId);
        // 지원서에는 이름/연락처/이메일이 그대로 남고, 로그인 실패 기록에는 학번과 IP 가 남는다.
        // 둘 다 감사 기록이 아니라 개인정보이므로 탈퇴 시 함께 지운다.
        recruitApplicationRepository.deleteByStudentId(studentId);
        loginFailureRepository.deleteByStudentId(studentId);
    }

    private void ensureNotFinalAdmin(Member member, String message) {
        if (member.getRole() == Member.Role.ADMIN && memberRepository.countByRole(Member.Role.ADMIN) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        }
    }

    public MemberResponse updateGeneration(Long id, String generation) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String cleaned = generation == null ? "" : generation.trim();
        if (!cleaned.matches("\\d{1,3}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "기수는 숫자(1~3자리)여야 합니다.");
        }
        member.setGeneration(cleaned);
        return toResponse(memberRepository.save(member));
    }

    public void resetPassword(Long id, String newPassword) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPassword(passwordEncoder.encode(newPassword));
        member.incrementTokenVersion();
        memberRepository.save(member);
    }

    @Transactional(readOnly = true)
    public List<LoginAuditResponse> listLoginAudit() {
        return memberRepository.findAll().stream()
                .filter(m -> m.getLastLoginAt() != null)
                .sorted(Comparator.comparing(Member::getLastLoginAt).reversed())
                .map(m -> new LoginAuditResponse(
                        m.getId(),
                        m.getStudentId(),
                        m.getName(),
                        m.getRole().name(),
                        m.getLastLoginAt(),
                        m.getLastLoginIp()
                ))
                .toList();
    }

    private MemberResponse toResponse(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getStudentId(),
                member.getName(),
                member.getEmail(),
                member.isEmailVerified(),
                member.getDepartment(),
                member.getGeneration(),
                member.getPhone(),
                member.getRole().name(),
                member.getAspiration(),
                member.getInterests(),
                member.getSelectedFontId(),
                member.getSelectedBuiltinFontKey()
        );
    }

    public record DeletedMemberSnapshot(
            Long id,
            String studentId,
            String name,
            String role,
            String email
    ) {
        private static DeletedMemberSnapshot from(Member member) {
            return new DeletedMemberSnapshot(
                    member.getId(),
                    member.getStudentId(),
                    member.getName(),
                    member.getRole().name(),
                    member.getEmail()
            );
        }
    }
}
