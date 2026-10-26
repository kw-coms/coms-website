package com.coms.backend.repository;

import com.coms.backend.domain.EligibleMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface EligibleMemberRepository extends JpaRepository<EligibleMember, Long> {
    List<EligibleMember> findAllByOrderByStudentIdAscNameAsc();
    Optional<EligibleMember> findByStudentId(String studentId);
    Optional<EligibleMember> findByNameAndPhone(String name, String phone);

    /** 존재만 본다. 같은 (이름, 전화번호) 행이 둘 이상이어도 터지지 않는다 —
     *  V6 의 UNIQUE 는 CREATE TABLE IF NOT EXISTS 안에 있어서 Hibernate 가 만든 스키마에는 없다. */
    boolean existsByNameAndPhone(String name, String phone);
    Optional<EligibleMember> findByVerificationKey(String verificationKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select member from EligibleMember member where member.id = :id")
    Optional<EligibleMember> findByIdForUpdate(@Param("id") long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<EligibleMember> findAllByNameAndAdmissionYear(String name, Integer admissionYear);
}
