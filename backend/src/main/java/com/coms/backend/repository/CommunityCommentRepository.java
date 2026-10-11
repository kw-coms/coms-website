package com.coms.backend.repository;

import com.coms.backend.domain.CommunityComment;
import com.coms.backend.domain.CommunityPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);
    List<CommunityComment> findByParentCommentId(Long parentCommentId);
    List<CommunityComment> findByStudentId(String studentId);
    boolean existsByParentCommentId(Long parentCommentId);
    /**
     * One statement, not a load-then-remove-each derived delete. In production
     * {@code parent_comment_id} is a self-referencing {@code ON DELETE CASCADE} key (V25), so
     * deleting a comment row already removes its replies; Hibernate then found zero rows for each
     * of those replies and failed the whole transaction — a post with any reply could not be
     * deleted. The entity mapping has no such key, which is why H2-backed tests never saw it.
     */
    @Modifying(flushAutomatically = true)
    @Query("delete from CommunityComment c where c.postId = :postId")
    void deleteByPostId(@Param("postId") Long postId);
    long countByPostId(Long postId);
    long countByStudentId(String studentId);
    long countByStudentIdAndCreatedAtAfter(String studentId, java.time.LocalDateTime createdAt);

    // Reputation inputs. Activity on the anonymous board is left out: an exact, member-visible
    // counter that moves whenever someone posts or comments anonymously says who did it.
    @Query("select count(c) from CommunityComment c where c.studentId = :studentId "
            + "and c.postId not in (select p.id from CommunityPost p where p.category = :excluded)")
    long countByStudentIdExcludingPostCategory(@Param("studentId") String studentId,
                                               @Param("excluded") CommunityPost.Category excluded);

    @Query("select c.studentId as studentId, count(c) as count from CommunityComment c "
            + "where c.studentId in :studentIds "
            + "and c.postId not in (select p.id from CommunityPost p where p.category = :excluded) "
            + "group by c.studentId")
    List<AuthorCount> countByStudentIdsExcludingPostCategory(@Param("studentIds") java.util.Collection<String> studentIds,
                                                             @Param("excluded") CommunityPost.Category excluded);

    @Query("select c.postId as postId, count(c) as count from CommunityComment c where c.postId in :postIds group by c.postId")
    List<CommentCount> countByPostIds(@Param("postIds") List<Long> postIds);

    @Query("select c.studentId as studentId, count(c) as count from CommunityComment c where c.studentId in :studentIds group by c.studentId")
    List<AuthorCount> countByStudentIds(@Param("studentIds") java.util.Collection<String> studentIds);

    interface CommentCount {
        Long getPostId();
        long getCount();
    }

    interface AuthorCount {
        String getStudentId();
        long getCount();
    }
}
