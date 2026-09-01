package com.coms.backend.repository;

import com.coms.backend.domain.MobilePushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MobilePushTokenRepository extends JpaRepository<MobilePushToken, Long> {
    Optional<MobilePushToken> findByToken(String token);

    List<MobilePushToken> findByMemberStudentIdAndEnabledTrue(String memberStudentId);

    void deleteByMemberStudentId(String memberStudentId);
}
