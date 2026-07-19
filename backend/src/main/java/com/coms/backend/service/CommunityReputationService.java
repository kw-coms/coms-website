package com.coms.backend.service;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityReputationResponse;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Derives community reputation on read from existing activity signals (posts, comments, net upvotes
 * received). Provides both the single-member lookup and the batched per-page tier map so post and
 * comment lists can badge authors inline without an N+1 fan-out.
 */
@Service
@Transactional
class CommunityReputationService {
    private final CommunityPostRepository communityPostRepository;
    private final CommunityCommentRepository commentRepository;
    private final CommunityPostVoteRepository voteRepository;
    private final CommunityAccess access;

    CommunityReputationService(CommunityPostRepository communityPostRepository,
                               CommunityCommentRepository commentRepository,
                               CommunityPostVoteRepository voteRepository,
                               CommunityAccess access) {
        this.communityPostRepository = communityPostRepository;
        this.commentRepository = commentRepository;
        this.voteRepository = voteRepository;
        this.access = access;
    }

    /**
     * Computes a member-visible reputation summary for {@code targetStudentId}. The viewer must be a
     * known member (member-visible, reusing the existing community auth). The result is derived on read
     * from a couple of aggregate count/sum queries — no per-row scan, no denormalized score column.
     */
    @Transactional(readOnly = true)
    public CommunityReputationResponse reputation(String viewerStudentId, String targetStudentId) {
        access.requireMember(viewerStudentId);
        Member target = access.requireMember(targetStudentId);
        long posts = communityPostRepository.countByAuthorStudentId(target.getStudentId());
        long comments = commentRepository.countByStudentId(target.getStudentId());
        long upvotes = voteRepository.sumVoteValueByPostAuthor(target.getStudentId());
        return CommunityReputation.compute(posts, comments, upvotes);
    }

    /**
     * Batch reputation tiers for a set of authors on a page, so the post/comment list can badge inline
     * without firing a request per author. Three grouped aggregate queries total, regardless of page
     * size, so this never degrades into N+1.
     */
    Map<String, CommunityReputationResponse> reputationTiers(Set<String> studentIds) {
        if (studentIds.isEmpty()) {
            return Map.of();
        }
        Map<String, Long> postCounts = communityPostRepository.countByAuthorStudentIds(studentIds).stream()
                .collect(Collectors.toMap(CommunityPostRepository.AuthorCount::getStudentId, CommunityPostRepository.AuthorCount::getCount));
        Map<String, Long> commentCounts = commentRepository.countByStudentIds(studentIds).stream()
                .collect(Collectors.toMap(CommunityCommentRepository.AuthorCount::getStudentId, CommunityCommentRepository.AuthorCount::getCount));
        Map<String, Long> upvoteSums = voteRepository.sumVoteValueByPostAuthors(studentIds).stream()
                .collect(Collectors.toMap(CommunityPostVoteRepository.AuthorVoteSum::getStudentId, CommunityPostVoteRepository.AuthorVoteSum::getTotal));
        return studentIds.stream().collect(Collectors.toMap(Function.identity(), id -> CommunityReputation.compute(
                postCounts.getOrDefault(id, 0L),
                commentCounts.getOrDefault(id, 0L),
                upvoteSums.getOrDefault(id, 0L))));
    }
}
