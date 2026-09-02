package com.coms.backend.service;

import com.coms.backend.domain.Member;
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
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminServiceTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final CommunityService communityService = mock(CommunityService.class);
    private final NoticeVoteRepository noticeVoteRepository = mock(NoticeVoteRepository.class);
    private final ClubActivityVoteRepository clubActivityVoteRepository = mock(ClubActivityVoteRepository.class);
    private final RecruitApplicationRepository recruitApplicationRepository = mock(RecruitApplicationRepository.class);
    private final LoginFailureRepository loginFailureRepository = mock(LoginFailureRepository.class);
    private final AdminService adminService = new AdminService(
            memberRepository,
            mock(PasswordEncoder.class),
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
            loginFailureRepository
    );

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

    private static Member member(String studentId, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName("관리자");
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded");
        member.setRole(role);
        return member;
    }
}
