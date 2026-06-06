package com.coms.backend.service;

import com.coms.backend.domain.BannedStudent;
import com.coms.backend.dto.BannedStudentResponse;
import com.coms.backend.repository.BannedStudentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class BannedStudentService {

    private final BannedStudentRepository bannedStudentRepository;

    public BannedStudentService(BannedStudentRepository bannedStudentRepository) {
        this.bannedStudentRepository = bannedStudentRepository;
    }

    public void ban(String studentId, String duration) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime expiresAt = BanDuration.from(duration).expiresAt(now);
        bannedStudentRepository.findByStudentId(studentId).ifPresent(existing -> {
            if (isActive(existing, now)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 차단된 학번입니다.");
            }
            bannedStudentRepository.delete(existing);
            bannedStudentRepository.flush();
        });
        bannedStudentRepository.save(new BannedStudent(studentId, expiresAt));
    }

    public void ensureNotBanned(String studentId) {
        if (isBanned(studentId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "차단된 계정입니다.");
        }
    }

    public void unban(String studentId) {
        BannedStudent entry = bannedStudentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "차단 목록에 없는 학번입니다."));
        bannedStudentRepository.delete(entry);
    }

    public boolean isBanned(String studentId) {
        return bannedStudentRepository.findByStudentId(studentId)
                .map(entry -> {
                    if (isExpired(entry, LocalDateTime.now())) {
                        bannedStudentRepository.delete(entry);
                        return false;
                    }
                    return true;
                })
                .orElse(false);
    }

    public List<BannedStudentResponse> listBanned() {
        bannedStudentRepository.deleteByExpiresAtLessThanEqual(LocalDateTime.now());
        return bannedStudentRepository.findAllByOrderByBannedAtDesc()
                .stream()
                .map(b -> new BannedStudentResponse(b.getId(), b.getStudentId(), b.getBannedAt(), b.getExpiresAt()))
                .toList();
    }

    private boolean isActive(BannedStudent entry, LocalDateTime now) {
        return !isExpired(entry, now);
    }

    private boolean isExpired(BannedStudent entry, LocalDateTime now) {
        return entry.getExpiresAt() != null && !entry.getExpiresAt().isAfter(now);
    }

    private enum BanDuration {
        SIX_HOURS("6H") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusHours(6); }
        },
        TWELVE_HOURS("12H") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusHours(12); }
        },
        TWENTY_FOUR_HOURS("24H") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusHours(24); }
        },
        THREE_DAYS("3D") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusDays(3); }
        },
        SEVEN_DAYS("7D") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusDays(7); }
        },
        THIRTY_ONE_DAYS("31D") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusDays(31); }
        },
        THREE_MONTHS("3M") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusMonths(3); }
        },
        SIX_MONTHS("6M") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusMonths(6); }
        },
        ONE_YEAR("1Y") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusYears(1); }
        },
        THREE_YEARS("3Y") {
            @Override LocalDateTime expiresAt(LocalDateTime now) { return now.plusYears(3); }
        };

        private final String code;

        BanDuration(String code) {
            this.code = code;
        }

        abstract LocalDateTime expiresAt(LocalDateTime now);

        private static BanDuration from(String value) {
            String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
            for (BanDuration duration : values()) {
                if (duration.code.equals(normalized)) {
                    return duration;
                }
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않은 차단 기간입니다.");
        }
    }
}
