package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {
    // Atomic increment so concurrent reads don't lose view counts (read-modify-write would).
    // clearAutomatically evicts the now-stale managed entity so a follow-up read sees the new value.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CommunityPost p set p.viewCount = p.viewCount + 1 where p.id = :id")
    void incrementViewCount(@Param("id") Long id);

    List<CommunityPost> findAllByOrderByCreatedAtDesc();
    List<CommunityPost> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc();
    List<CommunityPost> findAllByOrderByPinnedDescPinnedAtDescCreatedAtDesc(Pageable pageable);
    List<CommunityPost> findByAuthorStudentId(String authorStudentId);
    List<CommunityPost> findByAuthorStudentIdOrderByCreatedAtDesc(String authorStudentId);
    long countByAuthorStudentIdAndCreatedAtAfter(String authorStudentId, LocalDateTime createdAt);
    long countByAuthorStudentId(String authorStudentId);

    // Real DB-side pagination for the community post list (see CommunityService#listPaged). The
    // visibility rule for anonymous posts collapses to "category != ANONYMOUS" once we know the
    // viewer can't see anonymous posts, so it moves into SQL instead of an in-memory filter.
    List<CommunityPost> findByCategoryNotOrderByPinnedDescPinnedAtDescCreatedAtDesc(CommunityPost.Category category, Pageable pageable);
    long countByCategoryNot(CommunityPost.Category category);

    // Keyword search over title/content for the community post search endpoint (see
    // CommunityService#searchPaged). Case-insensitive LIKE; the keyword is pre-escaped for the '!'
    // escape char by the caller so user-supplied %/_ can't act as wildcards. Same pinned-first
    // ordering as the list endpoint, with a matching COUNT for real DB-side pagination.
    @Query(value = "select p from CommunityPost p where "
            + "(lower(p.title) like lower(concat('%', :keyword, '%')) escape '!' "
            + "or lower(p.content) like lower(concat('%', :keyword, '%')) escape '!') "
            + "order by p.pinned desc, p.pinnedAt desc, p.createdAt desc",
            countQuery = "select count(p) from CommunityPost p where "
                    + "(lower(p.title) like lower(concat('%', :keyword, '%')) escape '!' "
                    + "or lower(p.content) like lower(concat('%', :keyword, '%')) escape '!')")
    Page<CommunityPost> searchByKeyword(@Param("keyword") String keyword, Pageable pageable);

    @Query(value = "select p from CommunityPost p where p.category <> :excludedCategory and "
            + "(lower(p.title) like lower(concat('%', :keyword, '%')) escape '!' "
            + "or lower(p.content) like lower(concat('%', :keyword, '%')) escape '!') "
            + "order by p.pinned desc, p.pinnedAt desc, p.createdAt desc",
            countQuery = "select count(p) from CommunityPost p where p.category <> :excludedCategory and "
                    + "(lower(p.title) like lower(concat('%', :keyword, '%')) escape '!' "
                    + "or lower(p.content) like lower(concat('%', :keyword, '%')) escape '!')")
    Page<CommunityPost> searchByKeywordExcludingCategory(@Param("keyword") String keyword,
                                                         @Param("excludedCategory") CommunityPost.Category excludedCategory,
                                                         Pageable pageable);

    @Query("select p.authorStudentId as studentId, count(p) as count from CommunityPost p where p.authorStudentId in :studentIds group by p.authorStudentId")
    List<AuthorCount> countByAuthorStudentIds(@Param("studentIds") Collection<String> studentIds);

    interface AuthorCount {
        String getStudentId();
        long getCount();
    }
}
