package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.LoginAuditResponse;
import com.coms.backend.dto.MemberResponse;
import com.coms.backend.dto.RoleUpdateRequest;
import com.coms.backend.repository.ClubActivityVoteRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.NoticeVoteRepository;
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

    public AdminService(MemberRepository memberRepository, PasswordEncoder passwordEncoder, CommunityService communityService,
                        NoticeVoteRepository noticeVoteRepository, ClubActivityVoteRepository clubActivityVoteRepository) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.communityService = communityService;
        this.noticeVoteRepository = noticeVoteRepository;
        this.clubActivityVoteRepository = clubActivityVoteRepository;
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers() {
        return memberRepository.findAll().stream().map(this::toResponse).toList();
    }

    public MemberResponse updateRole(Long id, RoleUpdateRequest request) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        try {
            member.setRole(Member.Role.valueOf(request.role().trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role.");
        }
        return toResponse(memberRepository.save(member));
    }

    public DeletedMemberSnapshot deleteMember(Long id) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        DeletedMemberSnapshot snapshot = DeletedMemberSnapshot.from(member);
        communityService.deleteCommunityDataForMember(member.getStudentId());
        deleteEngagementVotesForMember(member.getStudentId());
        memberRepository.delete(member);
        return snapshot;
    }

    public DeletedMemberSnapshot deleteByStudentId(String studentId) {
        Member member = memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        DeletedMemberSnapshot snapshot = DeletedMemberSnapshot.from(member);
        communityService.deleteCommunityDataForMember(member.getStudentId());
        deleteEngagementVotesForMember(member.getStudentId());
        memberRepository.delete(member);
        return snapshot;
    }

    private void deleteEngagementVotesForMember(String studentId) {
        noticeVoteRepository.deleteByStudentId(studentId);
        clubActivityVoteRepository.deleteByStudentId(studentId);
    }

    public void resetPassword(Long id, String newPassword) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        member.setPassword(passwordEncoder.encode(newPassword));
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
