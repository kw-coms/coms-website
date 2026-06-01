package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.dto.CommunityPostResponse;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class CommunityService {
    private final CommunityPostRepository communityPostRepository;
    private final MemberRepository memberRepository;

    public CommunityService(CommunityPostRepository communityPostRepository, MemberRepository memberRepository) {
        this.communityPostRepository = communityPostRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional(readOnly = true)
    public List<CommunityPostResponse> list(String studentId) {
        Member member = findMember(studentId);
        return communityPostRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(post -> toResponse(post, member))
                .toList();
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request) {
        Member member = findMember(studentId);
        CommunityPost post = new CommunityPost();
        post.setTitle(request.title().trim());
        post.setContent(request.content().trim());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        return toResponse(communityPostRepository.save(post), member);
    }

    public void delete(String studentId, Long id) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        communityPostRepository.delete(post);
    }

    private Member findMember(String studentId) {
        return memberRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private CommunityPostResponse toResponse(CommunityPost post, Member currentMember) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || currentMember.getRole() == Member.Role.ADMIN;
        return new CommunityPostResponse(
                post.getId(),
                post.getTitle(),
                post.getContent(),
                post.getAuthorStudentId(),
                post.getAuthorName(),
                post.getCreatedAt(),
                post.getUpdatedAt(),
                editable
        );
    }
}
