package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AdminMemberCreateRequest;
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
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@Transactional
public class AdminService {

    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Set<Member.Role> CREATABLE_ROLES = EnumSet.of(
            Member.Role.ASSOCIATE,
            Member.Role.USER,
            Member.Role.OFFICER,
            Member.Role.VICE_PRESIDENT
    );

    private final MemberRepository memberRepository;
    private final EligibleMemberService eligibleMemberService;
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
    private final RefreshSessionService refreshSessionService;

    public AdminService(MemberRepository memberRepository, EligibleMemberService eligibleMemberService,
                        PasswordEncoder passwordEncoder, CommunityService communityService,
                        NoticeVoteRepository noticeVoteRepository, ClubActivityVoteRepository clubActivityVoteRepository,
                        ClubEventVoteRepository clubEventVoteRepository, ClubEventRsvpRepository clubEventRsvpRepository,
                        ArchiveFileVoteRepository archiveFileVoteRepository, NotificationRepository notificationRepository,
                        NotificationPreferenceRepository notificationPreferenceRepository,
                        MobilePushTokenRepository mobilePushTokenRepository, MiniAppDocumentRepository miniAppDocumentRepository,
                        TeamRandomizerRoomRepository teamRandomizerRoomRepository,
                        RecruitApplicationRepository recruitApplicationRepository,
                        LoginFailureRepository loginFailureRepository,
                        RefreshSessionService refreshSessionService) {
        this.memberRepository = memberRepository;
        this.eligibleMemberService = eligibleMemberService;
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
        this.refreshSessionService = refreshSessionService;
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers() {
        return memberRepository.findAll().stream().map(this::toResponse).toList();
    }

    public MemberResponse createMember(AdminMemberCreateRequest request) {
        String studentId = normalizeText(request.studentId());
        String name = normalizeText(request.name());
        String email = normalizeText(request.email()).toLowerCase(Locale.ROOT);
        String password = normalizeText(request.password());
        String generation = normalizeGeneration(request.generation());
        Member.Role role = parseCreatableRole(request.role());
        String department = blankToNull(request.department());
        String phone = blankToNull(request.phone());

        if (!studentId.matches("\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "학번은 숫자 10자리여야 합니다.");
        }
        eligibleMemberService.requireCurrentStudentIdForDirectMemberCreation(studentId);
        if (!name.matches("[가-힣]{2,10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름은 한글 2~10자여야 합니다.");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 형식을 확인해주세요.");
        }
        if (memberRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        if (password.isBlank() || password.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "임시 비밀번호를 입력해주세요.");
        }
        if (memberRepository.existsByStudentId(studentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 학번입니다.");
        }

        eligibleMemberService.ensureDirectMemberRosterRow(studentId, name, generation, phone, role);

        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(email);
        member.setPassword(passwordEncoder.encode(password));
        member.setEmailVerified(true);
        member.setDepartment(department);
        member.setGeneration(generation);
        member.setPhone(phone);
        member.setRole(role);
        return toResponse(memberRepository.save(member));
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
        refreshSessionService.deleteAllForStudent(studentId);
    }

    /**
     * 기수의 유일한 검증 지점. 1..99 범위만 허용하고(존재하지 않는 0기, "000" 거부),
     * 앞자리 0 을 떼어 "07" 과 "7" 이 서로 다른 기수처럼 저장되지 않게 정규화한다.
     */
    private static String normalizeGeneration(String generation) {
        String cleaned = generation == null ? "" : generation.trim();
        if (!cleaned.matches("\\d{1,3}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "기수는 숫자여야 합니다.");
        }
        int value = Integer.parseInt(cleaned);
        if (value < 1 || value > 99) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "기수는 1에서 99 사이여야 합니다.");
        }
        return String.valueOf(value);
    }

    private static Member.Role parseCreatableRole(String role) {
        Member.Role parsed;
        try {
            parsed = Member.Role.valueOf(normalizeText(role).toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role.");
        }
        if (!CREATABLE_ROLES.contains(parsed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "직접 생성할 수 없는 역할입니다.");
        }
        return parsed;
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String blankToNull(String value) {
        String normalized = normalizeText(value);
        return normalized.isBlank() ? null : normalized;
    }

    private void ensureNotFinalAdmin(Member member, String message) {
        if (member.getRole() == Member.Role.ADMIN && memberRepository.countByRole(Member.Role.ADMIN) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        }
    }

    public MemberResponse updateGeneration(Long id, String generation) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setGeneration(normalizeGeneration(generation));
        return toResponse(memberRepository.save(member));
    }

    public void resetPassword(Long id, String newPassword) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPassword(passwordEncoder.encode(newPassword));
        member.incrementTokenVersion();
        memberRepository.save(member);
        refreshSessionService.revokeAllForStudent(member.getStudentId());
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
