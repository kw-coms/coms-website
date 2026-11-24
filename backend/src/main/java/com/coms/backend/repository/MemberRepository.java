package com.coms.backend.repository;

import com.coms.backend.domain.Member;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    @Query("select m from Member m where "
            + "(:search is null or lower(m.name) like :search or m.studentId like :search "
            + "or lower(m.email) like :search or lower(m.department) like :search "
            + "or m.phone like :search or m.generation like :search) "
            + "and (:role is null or m.role = :role) "
            + "and (:verified is null or m.emailVerified = :verified)")
    Page<Member> searchAdminMembers(@Param("search") String search,
                                    @Param("role") Member.Role role,
                                    @Param("verified") Boolean verified,
                                    Pageable pageable);

    Page<Member> findByLastLoginAtNotNull(Pageable pageable);
    Optional<Member> findByStudentId(String studentId);

    // Serializes concurrent verification-code confirms so attempt counters can't be
    // lost to read-modify-write races (SELECT ... FOR UPDATE).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from Member m where m.id = :id")
    Optional<Member> findWithLockById(@org.springframework.data.repository.query.Param("id") Long id);
    Optional<Member> findByEmail(String email);
    Optional<Member> findByEmailIgnoreCase(String email);
    List<Member> findByStudentIdIn(Collection<String> studentIds);
    @org.springframework.data.jpa.repository.Query("select m from Member m where trim(m.name) in :names")
    List<Member> findByNormalizedNameIn(@org.springframework.data.repository.query.Param("names") Collection<String> names);
    List<Member> findByRole(Member.Role role);
    List<Member> findTop20ByNameContainingIgnoreCaseOrStudentIdContainingIgnoreCaseOrderByNameAsc(String name, String studentId);

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
