package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/** 한 임기의 회장 또는 부회장 한 명. 명부 행과 연결되면 그 행의 기수를 보여 준다. */
@Entity
@Table(name = "club_officers")
public class ClubOfficer {
    public enum OfficerRole { PRESIDENT, VICE_PRESIDENT }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "term_id", nullable = false)
    private Long termId;
    // V117 의 ON DELETE CASCADE / SET NULL 을 hibernate 가 만드는 H2 테스트 스키마에서도 똑같이 건다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "term_id", insertable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private ClubOfficerTerm term;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OfficerRole role;
    @Column(nullable = false, length = 40)
    private String name;
    @Column(name = "eligible_member_id")
    private Long eligibleMemberId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "eligible_member_id", insertable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.SET_NULL)
    private EligibleMember eligibleMember;
    @Column(nullable = false)
    private int position;

    public Long getId() { return id; }
    public Long getTermId() { return termId; }
    public void setTermId(Long value) { termId = value; }
    public OfficerRole getRole() { return role; }
    public void setRole(OfficerRole value) { role = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public Long getEligibleMemberId() { return eligibleMemberId; }
    public void setEligibleMemberId(Long value) { eligibleMemberId = value; }
    public int getPosition() { return position; }
    public void setPosition(int value) { position = value; }
}
