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
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

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
        List<CommunityPost> posts = communityPostRepository.findAllByOrderByCreatedAtDesc();
        Map<String, Member> authors = memberRepository.findByStudentIdIn(posts.stream()
                        .map(CommunityPost::getAuthorStudentId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(Member::getStudentId, Function.identity()));
        return posts.stream()
                .map(post -> toResponse(post, member, authors.get(post.getAuthorStudentId())))
                .toList();
    }

    public CommunityPostResponse create(String studentId, CommunityPostRequest request) {
        Member member = findMember(studentId);
        CommunityPost post = new CommunityPost();
        post.setTitle(request.title().trim());
        post.setContent(request.content().trim());
        post.setAuthorStudentId(member.getStudentId());
        post.setAuthorName(member.getName());
        return toResponse(communityPostRepository.save(post), member, member);
    }

    public CommunityPostResponse update(String studentId, Long id, CommunityPostRequest request) {
        Member member = findMember(studentId);
        CommunityPost post = communityPostRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!post.getAuthorStudentId().equals(member.getStudentId()) && member.getRole() != Member.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        post.setTitle(request.title().trim());
        post.setContent(request.content().trim());
        return toResponse(communityPostRepository.save(post), member,
                memberRepository.findByStudentId(post.getAuthorStudentId()).orElse(null));
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

    private CommunityPostResponse toResponse(CommunityPost post, Member currentMember, Member author) {
        boolean editable = post.getAuthorStudentId().equals(currentMember.getStudentId())
                || currentMember.getRole() == Member.Role.ADMIN;
        boolean authorAdmin = author != null && author.getRole() == Member.Role.ADMIN;
        String authorName = author != null ? author.getName() : post.getAuthorName();
        return new CommunityPostResponse(
                post.getId(),
                post.getTitle(),
                post.getContent(),
                post.getAuthorStudentId(),
                authorName,
                displayName(post.getAuthorStudentId(), authorName),
                authorAdmin,
                post.getCreatedAt(),
                post.getUpdatedAt(),
                editable
        );
    }

    static String displayName(String studentId, String name) {
        String trimmedName = name == null ? "" : name.trim();
        String generation = generationFromStudentId(studentId);
        return generation.isBlank() ? trimmedName : generation + trimmedName;
    }

    static String generationFromStudentId(String studentId) {
        if (studentId == null || !studentId.matches("\\d{10}")) {
            return "";
        }
        int admissionYear = Integer.parseInt(studentId.substring(0, 4));
        int generation = admissionYear - 1966;
        return generation > 0 ? generation + "기" : "";
    }
}
