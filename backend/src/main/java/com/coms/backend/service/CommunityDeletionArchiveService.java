package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.DeletedCommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.DeletedCommunityPostResponse;
import com.coms.backend.repository.DeletedCommunityPostRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CommunityDeletionArchiveService {
    private static final int DEFAULT_RECENT_LIMIT = 300;
    private static final int MAX_RECENT_LIMIT = 1000;

    private final DeletedCommunityPostRepository repository;

    public CommunityDeletionArchiveService(DeletedCommunityPostRepository repository) {
        this.repository = repository;
    }

    public DeletedCommunityPost record(CommunityPost post, Member deletedBy, String reason) {
        DeletedCommunityPost snapshot = new DeletedCommunityPost();
        snapshot.setOriginalPostId(post.getId());
        snapshot.setTitle(post.getTitle());
        snapshot.setContent(post.getContent());
        snapshot.setAuthorStudentId(post.getAuthorStudentId());
        snapshot.setAuthorName(post.getAuthorName());
        snapshot.setCategory(post.getCategory().name());
        snapshot.setViewCount(post.getViewCount());
        snapshot.setOriginalCreatedAt(post.getCreatedAt());
        snapshot.setOriginalUpdatedAt(post.getUpdatedAt());
        snapshot.setDeletedByStudentId(deletedBy.getStudentId());
        snapshot.setDeletedByName(deletedBy.getName());
        snapshot.setDeletedByRole(deletedBy.getRole().name());
        snapshot.setDeletionReason(reason);
        return repository.save(snapshot);
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent() {
        return recent(DEFAULT_RECENT_LIMIT);
    }

    @Transactional(readOnly = true)
    public List<DeletedCommunityPostResponse> recent(int limit) {
        return repository.findAllByOrderByDeletedAtDesc(PageRequest.of(0, boundedLimit(limit))).stream()
                .map(this::toResponse)
                .toList();
    }

    private int boundedLimit(int limit) {
        if (limit < 1) {
            return 1;
        }
        return Math.min(limit, MAX_RECENT_LIMIT);
    }

    private DeletedCommunityPostResponse toResponse(DeletedCommunityPost snapshot) {
        return new DeletedCommunityPostResponse(
                snapshot.getId(),
                snapshot.getOriginalPostId(),
                snapshot.getTitle(),
                snapshot.getContent(),
                snapshot.getAuthorStudentId(),
                snapshot.getAuthorName(),
                snapshot.getCategory(),
                snapshot.getViewCount(),
                snapshot.getOriginalCreatedAt(),
                snapshot.getOriginalUpdatedAt(),
                snapshot.getDeletedByStudentId(),
                snapshot.getDeletedByName(),
                snapshot.getDeletedByRole(),
                snapshot.getDeletionReason(),
                snapshot.getDeletedAt()
        );
    }
}
