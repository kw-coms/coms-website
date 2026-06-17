package com.coms.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "team_randomizer_rooms",
        uniqueConstraints = @UniqueConstraint(name = "uk_team_randomizer_room_owner_room", columnNames = {"owner_student_id", "room_id"})
)
public class TeamRandomizerRoom {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_id", nullable = false, length = 120)
    private String roomId;

    @Column(name = "room_name", nullable = false, length = 100)
    private String roomName;

    @Column(name = "owner_student_id", nullable = false, length = 50)
    private String ownerStudentId;

    @Column(name = "owner_name", length = 100)
    private String ownerName;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "participants_json", nullable = false, columnDefinition = "TEXT")
    private String participantsJson = "[]";

    @Column(name = "profiles_json", nullable = false, columnDefinition = "TEXT")
    private String profilesJson = "{}";

    @Column(name = "roles_json", nullable = false, columnDefinition = "TEXT")
    private String rolesJson = "[]";

    @Column(name = "role_rules_json", nullable = false, columnDefinition = "TEXT")
    private String roleRulesJson = "{}";

    @Column(name = "fairness_json", nullable = false, columnDefinition = "TEXT")
    private String fairnessJson = "{}";

    @Column(name = "histories_json", nullable = false, columnDefinition = "TEXT")
    private String historiesJson = "[]";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getRoomId() { return roomId; }
    public void setRoomId(String roomId) { this.roomId = roomId; }
    public String getRoomName() { return roomName; }
    public void setRoomName(String roomName) { this.roomName = roomName; }
    public String getOwnerStudentId() { return ownerStudentId; }
    public void setOwnerStudentId(String ownerStudentId) { this.ownerStudentId = ownerStudentId; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getParticipantsJson() { return participantsJson; }
    public void setParticipantsJson(String participantsJson) { this.participantsJson = participantsJson; }
    public String getProfilesJson() { return profilesJson; }
    public void setProfilesJson(String profilesJson) { this.profilesJson = profilesJson; }
    public String getRolesJson() { return rolesJson; }
    public void setRolesJson(String rolesJson) { this.rolesJson = rolesJson; }
    public String getRoleRulesJson() { return roleRulesJson; }
    public void setRoleRulesJson(String roleRulesJson) { this.roleRulesJson = roleRulesJson; }
    public String getFairnessJson() { return fairnessJson; }
    public void setFairnessJson(String fairnessJson) { this.fairnessJson = fairnessJson; }
    public String getHistoriesJson() { return historiesJson; }
    public void setHistoriesJson(String historiesJson) { this.historiesJson = historiesJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
