package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeVoteRepository;
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
    private final AdminService adminService = new AdminService(
            memberRepository,
            mock(PasswordEncoder.class),
            communityService,
            noticeVoteRepository,
            clubActivityVoteRepository
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
