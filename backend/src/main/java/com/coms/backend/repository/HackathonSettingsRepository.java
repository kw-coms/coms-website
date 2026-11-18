package com.coms.backend.repository;

import com.coms.backend.domain.HackathonSettings;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface HackathonSettingsRepository extends JpaRepository<HackathonSettings, Short> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from HackathonSettings state where state.id = 1")
    Optional<HackathonSettings> lockState();
}
