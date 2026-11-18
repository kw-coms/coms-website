package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "hackathon_settings")
public class HackathonSettings {
    @Id
    private Short id = 1;
    @Column(nullable = false)
    private boolean open = true;

    public Short getId() { return id; }
    public boolean isOpen() { return open; }
    public void setOpen(boolean value) { open = value; }
}
