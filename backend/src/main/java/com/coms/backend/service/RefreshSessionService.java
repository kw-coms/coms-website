package com.coms.backend.service;

import com.coms.backend.domain.RefreshSession;
import com.coms.backend.repository.RefreshSessionRepository;
import com.coms.backend.security.JwtTokenProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Rotating refresh sessions with reuse detection.
 *
 * <p>A login opens a <em>family</em> (named after its first token's jti). Every refresh revokes the
 * presented token and issues a new one in the same family, so at most one token per family is live
 * at a time. If a token that was already rotated comes back, the only explanations are theft or a
 * replay — so the entire family is revoked and the device has to log in again.
 */
@Service
@Transactional
public class RefreshSessionService {

    private static final Logger log = LoggerFactory.getLogger(RefreshSessionService.class);

    /**
     * Two refreshes firing at once (double-clicked tab, two in-flight requests after a 401) both
     * present the same jti. One wins the atomic claim; the loser must be rejected without nuking the
     * family, or ordinary users would be logged out by their own browser. We treat a rejection as a
     * benign race — rather than reuse — when the row was already replaced and was revoked within this
     * window, which is far shorter than any realistic attacker replay.
     */
    private static final Duration BENIGN_RACE_WINDOW = Duration.ofSeconds(10);

    public enum Outcome {
        /** Rotated: {@link Result#jti()} / {@link Result#family()} name the newly issued token. */
        ROTATED,
        /** A rotated token came back — the whole family has been revoked. */
        REUSE_DETECTED,
        /** Lost a concurrent rotation race. Reject the call, keep the family alive. */
        RACE_LOSER,
        /** No live session for this token (unknown, expired, or belongs to someone else). */
        REJECTED
    }

    public record Result(Outcome outcome, String jti, String family) {
        static Result rejected(Outcome outcome) {
            return new Result(outcome, null, null);
        }
    }

    private final RefreshSessionRepository refreshSessionRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;

    public RefreshSessionService(RefreshSessionRepository refreshSessionRepository,
                                 JwtTokenProvider jwtTokenProvider,
                                 Clock clock) {
        this.refreshSessionRepository = refreshSessionRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
    }

    /** Starts a new family for a fresh login (or for a legacy token accepted under the grace rule). */
    public Result openSession(String studentId, boolean rememberMe) {
        String jti = JwtTokenProvider.newSessionId();
        insert(jti, jti, studentId, rememberMe);
        return new Result(Outcome.ROTATED, jti, jti);
    }

    /** Rotates the presented refresh token, or explains why it was refused. */
    public Result rotate(String studentId, String jti, String family, boolean rememberMe) {
        if (jti == null || family == null) {
            return Result.rejected(Outcome.REJECTED);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        Optional<RefreshSession> found = refreshSessionRepository.findByJti(jti);
        if (found.isEmpty()) {
            return Result.rejected(Outcome.REJECTED);
        }
        RefreshSession session = found.get();
        if (!session.getStudentId().equals(studentId) || !session.getFamily().equals(family)) {
            return Result.rejected(Outcome.REJECTED);
        }
        if (session.getRevokedAt() != null) {
            if (isBenignRace(session, now)) {
                return Result.rejected(Outcome.RACE_LOSER);
            }
            revokeFamily(session.getFamily());
            log.warn("Refresh-token reuse detected for {} — revoked session family {}",
                    mask(studentId), session.getFamily());
            return Result.rejected(Outcome.REUSE_DETECTED);
        }
        if (session.getExpiresAt().isBefore(now)) {
            return Result.rejected(Outcome.REJECTED);
        }

        String newJti = JwtTokenProvider.newSessionId();
        if (refreshSessionRepository.claimForRotation(jti, newJti, now) == 0) {
            // Another request rotated this exact token between our read and this update.
            return Result.rejected(Outcome.RACE_LOSER);
        }
        insert(newJti, session.getFamily(), studentId, rememberMe);
        return new Result(Outcome.ROTATED, newJti, session.getFamily());
    }

    /** Revokes one device's session. Used by logout. */
    public void revokeFamily(String family) {
        if (family != null) {
            refreshSessionRepository.revokeFamily(family, LocalDateTime.now(clock));
        }
    }

    /** Revokes every session of the member — password change, admin password reset, bans. */
    public void revokeAllForStudent(String studentId) {
        if (studentId != null) {
            refreshSessionRepository.revokeAllForStudent(studentId, LocalDateTime.now(clock));
        }
    }

    /** Deletes every session row of the member — withdrawal / admin delete. */
    public void deleteAllForStudent(String studentId) {
        if (studentId != null) {
            refreshSessionRepository.deleteByStudentId(studentId);
        }
    }

    private boolean isBenignRace(RefreshSession session, LocalDateTime now) {
        return session.getReplacedBy() != null
                && session.getRevokedAt().isAfter(now.minus(BENIGN_RACE_WINDOW));
    }

    private void insert(String jti, String family, String studentId, boolean rememberMe) {
        LocalDateTime expiresAt = LocalDateTime.now(clock).plus(jwtTokenProvider.refreshLifetime(rememberMe));
        refreshSessionRepository.save(new RefreshSession(jti, family, studentId, rememberMe, expiresAt));
    }

    private static String mask(String studentId) {
        if (studentId == null || studentId.length() <= 3) {
            return "***";
        }
        return studentId.substring(0, 3) + "***";
    }
}
