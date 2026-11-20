package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 역대 회장단의 한 임기(대). 예: 초대, 52대. */
@Entity
@Table(name = "club_officer_terms")
public class ClubOfficerTerm {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 20, unique = true)
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
