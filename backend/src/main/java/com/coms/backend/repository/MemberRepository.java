package com.coms.backend.repository;

import com.coms.backend.domain.Member;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    Optional<Member> findByStudentId(String studentId);
    Optional<Member> findByEmail(String email);
    Optional<Member> findByEmailIgnoreCase(String email);
    List<Member> findByStudentIdIn(Collection<String> studentIds);
    List<Member> findByRole(Member.Role role);

    // Fan-out only needs recipient ids — avoids loading full Member entities
    // (including the long aspiration/interests text columns) for every member.
    @org.springframework.data.jpa.repository.Query("select m.studentId from Member m where m.studentId is not null")
    List<String> findAllStudentIds();

    @org.springframework.data.jpa.repository.Query("select m.studentId from Member m where m.studentId is not null and m.role in :roles")
    List<String> findStudentIdsByRoleIn(@org.springframework.data.repository.query.Param("roles") java.util.Collection<Member.Role> roles);
    long countByRole(Member.Role role);
    boolean existsByRole(Member.Role role);
    boolean existsByStudentId(String studentId);
    boolean existsByEmail(String email);
}
