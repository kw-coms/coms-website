package com.coms.backend.service;

import com.coms.backend.domain.MobilePushToken;
import com.coms.backend.dto.PushTokenRequest;
import com.coms.backend.repository.MobilePushTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@Transactional
public class MobilePushTokenService {

    private final MobilePushTokenRepository repository;

    public MobilePushTokenService(MobilePushTokenRepository repository) {
        this.repository = repository;
    }

    public void register(String memberStudentId, PushTokenRequest request) {
        MobilePushToken token = repository.findByToken(request.token())
                .orElseGet(MobilePushToken::new);
        token.setMemberStudentId(memberStudentId);
        token.setToken(request.token());
        token.setPlatform(normalize(request.platform(), 64));
        token.setDeviceId(normalize(request.deviceId(), 128));
        token.setEnabled(true);
        token.setUpdatedAt(LocalDateTime.now());
        repository.save(token);
    }

    private String normalize(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
