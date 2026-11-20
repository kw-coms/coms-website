package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 역대 회장단의 한 임기(대). 예: 초대, 52대.
 * club_officers 가 회장단의 기준 기록이고 eligible_members.officer_history 는 자유 서술 메모(본인 신고 포함)다.
 */
@Entity
// 제약 이름을 V117 과 같게 둬서 hibernate 가 만든 테스트 스키마에서도 서비스가 라벨 중복을 알아본다.
@Table(name = "club_officer_terms", uniqueConstraints = @UniqueConstraint(name = "uq_club_officer_terms_label", columnNames = "label"))
public class ClubOfficerTerm {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 20)
    private String label;
    @Column(name = "`year`", nullable = false)
    private int year;
    @Column(nullable = false)
    private int position;
    @Column(nullable = false, length = 200)
    private String note = "";

    public Long getId() { return id; }
    public String getLabel() { return label; }
    public void setLabel(String value) { label = value; }
    public int getYear() { return year; }
    public void setYear(int value) { year = value; }
    public int getPosition() { return position; }
    public void setPosition(int value) { position = value; }
    public String getNote() { return note; }
    public void setNote(String value) { note = value; }
}
