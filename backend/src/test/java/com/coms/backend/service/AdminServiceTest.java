package com.coms.backend.service;

import com.coms.backend.domain.EligibleMember;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.AdminMemberCreateRequest;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.repository.ArchiveFileVoteRepository;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.ClubEventRsvpRepository;
import com.coms.backend.repository.ClubEventVoteRepository;
import com.coms.backend.repository.EligibleMemberRepository;
import com.coms.backend.repository.LoginFailureRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MiniAppDocumentRepository;
import com.coms.backend.repository.MobilePushTokenRepository;
import com.coms.backend.repository.NoticeVoteRepository;
import com.coms.backend.repository.NotificationPreferenceRepository;
import com.coms.backend.repository.NotificationRepository;
import com.coms.backend.repository.RecruitApplicationRepository;
import com.coms.backend.repository.TeamRandomizerRoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:admin-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/admin-service"
})
@Transactional
class AdminServiceTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final EligibleMemberService eligibleMemberService = mock(EligibleMemberService.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final CommunityService communityService = mock(CommunityService.class);
    private final NoticeVoteRepository noticeVoteRepository = mock(NoticeVoteRepository.class);
    private final ClubActivityVoteRepository clubActivityVoteRepository = mock(ClubActivityVoteRepository.class);
    private final RecruitApplicationRepository recruitApplicationRepository = mock(RecruitApplicationRepository.class);
    private final LoginFailureRepository loginFailureRepository = mock(LoginFailureRepository.class);
    private final AdminService adminService = new AdminService(
            memberRepository,
            eligibleMemberService,
            passwordEncoder,
            communityService,
            noticeVoteRepository,
            clubActivityVoteRepository,
            mock(ClubEventVoteRepository.class),
            mock(ClubEventRsvpRepository.class),
            mock(ArchiveFileVoteRepository.class),
            mock(NotificationRepository.class),
            mock(NotificationPreferenceRepository.class),
            mock(MobilePushTokenRepository.class),
            mock(MiniAppDocumentRepository.class),
            mock(TeamRandomizerRoomRepository.class),
            recruitApplicationRepository,
            loginFailureRepository,
            mock(RefreshSessionService.class)
    );

    @Autowired
    private AdminService realAdminService;

    @Autowired
    private MemberRepository realMemberRepository;

    @Autowired
    private EligibleMemberRepository realEligibleMemberRepository;

    @Autowired
    private PasswordEncoder realPasswordEncoder;

    @BeforeEach
    void setUp() {
        realMemberRepository.deleteAll();
        realEligibleMemberRepository.deleteAll();
    }

    @Test
    void deleteMemberRejectsRemovingFinalAdmin() {
        Member admin = member("admin", Member.Role.ADMIN);
        when(memberRepository.findById(1L)).thenReturn(Optional.of(admin));
        when(memberRepository.countByRole(Member.Role.ADMIN)).thenReturn(1L);

        assertThatThrownBy(() -> adminService.deleteMember(1L))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(memberRepository, never()).delete(admin);
        verify(communityService, never()).deleteCommunityDataForMember("admin");
        verify(noticeVoteRepository, never()).deleteByStudentId("admin");
        verify(clubActivityVoteRepository, never()).deleteByStudentId("admin");
    }

    @Test
    void deleteByStudentIdRejectsFinalAdminWithdrawal() {
        Member admin = member("admin", Member.Role.ADMIN);
        when(memberRepository.findByStudentId("admin")).thenReturn(Optional.of(admin));
        when(memberRepository.countByRole(Member.Role.ADMIN)).thenReturn(1L);

        assertThatThrownBy(() -> adminService.deleteByStudentId("admin"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(memberRepository, never()).delete(admin);
        verify(communityService, never()).deleteCommunityDataForMember("admin");
        verify(noticeVoteRepository, never()).deleteByStudentId("admin");
        verify(clubActivityVoteRepository, never()).deleteByStudentId("admin");
    }

    @Test
    void withdrawalPurgesRecruitApplicationsAndLoginFailures() {
        Member user = member("2026123456", Member.Role.USER);
        when(memberRepository.findByStudentId("2026123456")).thenReturn(Optional.of(user));

        adminService.deleteByStudentId("2026123456");

        // 지원서(이름·연락처·이메일)와 로그인 실패 기록(학번·IP)도 개인정보라 함께 지워야 한다.
        verify(recruitApplicationRepository).deleteByStudentId("2026123456");
        verify(loginFailureRepository).deleteByStudentId("2026123456");
        verify(memberRepository).delete(user);
    }

    @Test
    void rejectedWithdrawalPurgesNothing() {
        Member admin = member("admin", Member.Role.ADMIN);
        when(memberRepository.findByStudentId("admin")).thenReturn(Optional.of(admin));
        when(memberRepository.countByRole(Member.Role.ADMIN)).thenReturn(1L);

        assertThatThrownBy(() -> adminService.deleteByStudentId("admin"))
                .isInstanceOf(ResponseStatusException.class);

        verify(recruitApplicationRepository, never()).deleteByStudentId("admin");
        verify(loginFailureRepository, never()).deleteByStudentId("admin");
    }

    @Test
    void updateGenerationRejectsOutOfRangeValues() {
        Member user = member("2026123456", Member.Role.USER);
        when(memberRepository.findById(1L)).thenReturn(Optional.of(user));

        // 0기는 존재하지 않는다 — "0", "000" 모두 거부해야 한다.
        for (String invalid : new String[]{"0", "00", "000", "100", "", " ", "abc", null}) {
            assertThatThrownBy(() -> adminService.updateGeneration(1L, invalid))
                    .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                            assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        }
    }

    @Test
    void updateGenerationNormalizesLeadingZeros() {
        Member user = member("2026123456", Member.Role.USER);
        when(memberRepository.findById(1L)).thenReturn(Optional.of(user));
        when(memberRepository.save(user)).thenReturn(user);

        adminService.updateGeneration(1L, " 007 ");
        assertThat(user.getGeneration()).isEqualTo("7");

        adminService.updateGeneration(1L, "99");
        assertThat(user.getGeneration()).isEqualTo("99");
    }

    @Test
    void createMemberRejectsAdminRole() {
        assertThatThrownBy(() -> adminService.createMember(createRequest("2026123456", "홍길동", "hong@example.com", "ADMIN")))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        verify(memberRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(eligibleMemberService, never()).ensureDirectMemberRosterRow(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void createMemberRoleAllowlistIsExplicit() throws Exception {
        assertThat(Set.of(Member.Role.values()))
                .containsExactlyInAnyOrder(
                        Member.Role.ASSOCIATE,
                        Member.Role.USER,
                        Member.Role.OFFICER,
                        Member.Role.VICE_PRESIDENT,
                        Member.Role.ADMIN);
        assertThat(Files.readString(Path.of("src/main/java/com/coms/backend/service/AdminService.java")))
                .contains("EnumSet.of(")
                .contains("Member.Role.ASSOCIATE")
                .contains("Member.Role.USER")
                .contains("Member.Role.OFFICER")
                .contains("Member.Role.VICE_PRESIDENT");
    }

    @Test
    void createMemberRejectsDuplicateStudentId() {
        when(memberRepository.existsByStudentId("2026123456")).thenReturn(true);

        assertThatThrownBy(() -> adminService.createMember(createRequest("2026123456", "홍길동", "hong@example.com", "USER")))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(memberRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(eligibleMemberService, never()).ensureDirectMemberRosterRow(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void createMemberRejectsDuplicateEmailIgnoringCase() {
        when(memberRepository.findByEmailIgnoreCase("hong@example.com")).thenReturn(Optional.of(member("2026000001", Member.Role.USER)));

        assertThatThrownBy(() -> adminService.createMember(createRequest("2026123456", "홍길동", "hong@example.com", "USER")))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(memberRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(eligibleMemberService, never()).ensureDirectMemberRosterRow(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void createMemberRejectsConflictingRosterName() {
        org.mockito.Mockito.doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "이미 다른 이름으로 명부에 등록된 학번입니다."))
                .when(eligibleMemberService)
                .ensureDirectMemberRosterRow("2026123456", "홍길동", "60", "01012345678", Member.Role.USER);

        assertThatThrownBy(() -> adminService.createMember(createRequest("2026123456", "홍길동", "hong@example.com", "USER")))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(memberRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void presidentCreatesVerifiedMemberAndMatchingRosterRowWithTemporaryPassword() {
        MemberResponse created = realAdminService.createMember(new AdminMemberCreateRequest(
                "2020123456", "홍길동", "hong@example.com", "1234", "60", "USER", "컴퓨터정보공학부", null));

        assertThat(created.emailVerified()).isTrue();
        assertThat(created.studentId()).isEqualTo("2020123456");
        assertThat(created.email()).isEqualTo("hong@example.com");
        assertThat(created.generation()).isEqualTo("60");
        assertThat(created.department()).isEqualTo("컴퓨터정보공학부");
        assertThat(realEligibleMemberRepository.findByStudentId("2020123456"))
                .get()
                .extracting(EligibleMember::getName, EligibleMember::getGeneration, EligibleMember::getInitialRole)
                .containsExactly("홍길동", "60", Member.Role.USER);
        assertThat(realMemberRepository.findByStudentId("2020123456"))
                .get()
                .satisfies(member -> {
                    assertThat(member.isEmailVerified()).isTrue();
                    assertThat(realPasswordEncoder.matches("1234", member.getPassword())).isTrue();
                    assertThat(member.getPassword()).isNotEqualTo("1234");
                    assertThat(member.getRole()).isEqualTo(Member.Role.USER);
                });
    }

    @Test
    void createMemberRejectsGraduateYearTenDigitStudentIdWithoutMutation() {
        assertThatThrownBy(() -> realAdminService.createMember(new AdminMemberCreateRequest(
                "2019123456", "홍길동", "hong@example.com", "1234", "60", "USER", null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        assertThat(realEligibleMemberRepository.findByStudentId("2019123456")).isEmpty();
        assertThat(realMemberRepository.findByStudentId("2019123456")).isEmpty();
    }

    @Test
    void createMemberRollsBackRosterWhenMemberSaveFailsOnDuplicateEmail() {
        realMemberRepository.save(existingMember("2026000001", "기존회원", "hong@example.com"));

        assertThatThrownBy(() -> realAdminService.createMember(new AdminMemberCreateRequest(
                "2026123456", "홍길동", "hong@example.com", "1234", "60", "USER", null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        assertThat(realEligibleMemberRepository.findByStudentId("2026123456")).isEmpty();
        assertThat(realMemberRepository.findByStudentId("2026123456")).isEmpty();
    }

    private static AdminMemberCreateRequest createRequest(String studentId, String name, String email, String role) {
        return new AdminMemberCreateRequest(studentId, name, email, "1234", "60", role, "컴퓨터정보공학부", "01012345678");
    }

    private static Member member(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("관리자");
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded");
        member.setRole(role);
        return member;
    }

    private static Member existingMember(String studentId, String name, String email) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(email);
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setGeneration("60");
        member.setRole(Member.Role.USER);
        return member;
    }
}
