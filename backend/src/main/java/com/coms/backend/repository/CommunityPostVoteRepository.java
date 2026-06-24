package com.coms.backend.repository;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.CommunityPostVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CommunityPostVoteRepository extends JpaRepository<CommunityPostVote, Long> {
    List<CommunityPostVote> findByPostIdIn(Collection<Long> postIds);
    Optional<CommunityPostVote> findByPostAndStudentId(CommunityPost post, String studentId);
    void deleteByPost(CommunityPost post);
    void deleteByStudentId(String studentId);

    @Query("select coalesce(sum(v.value), 0) from CommunityPostVote v where v.post.authorStudentId = :studentId")
    long sumVoteValueByPostAuthor(@Param("studentId") String studentId);

    @Query("select v.post.authorStudentId as studentId, coalesce(sum(v.value), 0) as total from CommunityPostVote v where v.post.authorStudentId in :studentIds group by v.post.authorStudentId")
    List<AuthorVoteSum> sumVoteValueByPostAuthors(@Param("studentIds") Collection<String> studentIds);

    interface AuthorVoteSum {
        String getStudentId();
        long getTotal();
    }
}
