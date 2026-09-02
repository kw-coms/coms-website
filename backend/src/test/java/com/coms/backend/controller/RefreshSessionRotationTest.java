package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.AuthResponse;
import com.coms.backend.dto.LoginRequest;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.RefreshSessionRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.AuthService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Refresh-token rotation, reuse detection and per-device logout, exercised through the real
 * controller + repository rather than mocks — the interesting behaviour is all in what the
 * {@code refresh_sessions} rows look like after each call.
 */
@SpringBootTest(properties = {
        "jwt.secret=" + RefreshSessionRotationTest.SECRET,
        "spring.datasource.url=jdbc:h2:mem:refresh-session-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class RefreshSessionRotationTest {

    static final String SECRET = "refresh-session-test-secret-key-32+chars";

    private static final String STUDENT_ID = "2026123456";
    private static final String PASSWORD = "Password1!";

    @Autowired private AuthController authController;
    @Autowired private AuthService authService;
    @Autowired private JwtTokenProvider jwtTokenProvider;
    @Autowired private MemberRepository memberRepository;
    @Autowired private RefreshSessionRepository refreshSessionRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        refreshSessionRepository.deleteAll();
        memberRepository.findByStudentId(STUDENT_ID).ifPresent(memberRepository::delete);
        jdbcTemplate.update("DELETE FROM login_failures");

        Member member = new Member();
        member.setStudentId(STUDENT_ID);
        member.setName("홍길동");
        member.setEmail("refresh-session@example.com");
        member.setEmailVerified(true);
        member.setPassword(passwordEncoder.encode(PASSWORD));
        memberRepository.save(member);
    }

    @Test
    void rotationIssuesANewSessionIdAndRevokesTheOldOne() {
        AuthResponse login = login();
        String firstJti = jwtTokenProvider.getSessionId(login.refreshToken());
        String family = jwtTokenProvider.getFamily(login.refreshToken());

        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(refresh(login.refreshToken(), response).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        String rotated = cookieValue(response, "refreshToken");
        assertThat(jwtTokenProvider.getSessionId(rotated)).isNotEqualTo(firstJti);
        assertThat(jwtTokenProvider.getFamily(rotated)).isEqualTo(family);
        // The access cookie carries the same family so logout can revoke exactly this device.
        assertThat(jwtTokenProvider.getFamily(cookieValue(response, "token"))).isEqualTo(family);

        var old = refreshSessionRepository.findByJti(firstJti).orElseThrow();
        assertThat(old.getRevokedAt()).isNotNull();
        assertThat(old.getReplacedBy()).isEqualTo(jwtTokenProvider.getSessionId(rotated));
        assertThat(refreshSessionRepository.findByJti(jwtTokenProvider.getSessionId(rotated))
                .orElseThrow().getRevokedAt()).isNull();
    }

    @Test
    void replayingARotatedTokenRevokesTheWholeFamily() {
        AuthResponse login = login();
        String stolen = login.refreshToken();
        String family = jwtTokenProvider.getFamily(stolen);

        MockHttpServletResponse rotation = new MockHttpServletResponse();
        refresh(stolen, rotation);
        String live = cookieValue(rotation, "refreshToken");

        // Age the revocation past the benign-race window so this reads as a genuine replay
        // rather than the member's own browser firing two refreshes at once.
        jdbcTemplate.update("UPDATE refresh_sessions SET revoked_at = ? WHERE jti = ?",
                Timestamp.valueOf(LocalDateTime.now().minusMinutes(5)), jwtTokenProvider.getSessionId(stolen));

        assertThat(refresh(stolen, new MockHttpServletResponse()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // The legitimate device is logged out too — that is the point of reuse detection.
        assertThat(refresh(live, new MockHttpServletResponse()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(liveSessionCount(family)).isZero();
    }

    @Test
    void concurrentRefreshRejectsTheLoserWithoutRevokingTheFamily() {
        AuthResponse login = login();
        String shared = login.refreshToken();
        String family = jwtTokenProvider.getFamily(shared);

        MockHttpServletResponse winner = new MockHttpServletResponse();
        assertThat(refresh(shared, winner).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        String rotated = cookieValue(winner, "refreshToken");

        // Second in-flight request with the same cookie, immediately after: benign race.
        assertThat(refresh(shared, new MockHttpServletResponse()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // The winner's token must survive — otherwise a double-clicked tab logs the member out.
        assertThat(liveSessionCount(family)).isEqualTo(1);
        assertThat(refresh(rotated, new MockHttpServletResponse()).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void legacyRefreshTokenWithoutAFamilyIsAcceptedOnceAndAdopted() {
        String legacy = legacyRefreshToken(STUDENT_ID, 0);
        assertThat(jwtTokenProvider.getFamily(legacy)).isNull();

        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(refresh(legacy, response).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        String adopted = cookieValue(response, "refreshToken");
        assertThat(jwtTokenProvider.getFamily(adopted)).isNotNull();
        assertThat(refreshSessionRepository.findByJti(jwtTokenProvider.getSessionId(adopted))).isPresent();
    }

    @Test
    void logoutEndsOnlyTheDeviceThatCalledIt() {
        AuthResponse deviceA = login();
        AuthResponse deviceB = login();
        assertThat(jwtTokenProvider.getFamily(deviceA.refreshToken()))
                .isNotEqualTo(jwtTokenProvider.getFamily(deviceB.refreshToken()));

        MockHttpServletRequest logout = new MockHttpServletRequest();
        logout.setCookies(new Cookie("token", deviceA.token()));
        authController.logout(logout, new MockHttpServletResponse());

        assertThat(refresh(deviceA.refreshToken(), new MockHttpServletResponse()).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(refresh(deviceB.refreshToken(), new MockHttpServletResponse()).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void changingThePasswordEndsEverySession() {
        AuthResponse deviceA = login();
        AuthResponse deviceB = login();

        authService.changePassword(STUDENT_ID, PASSWORD, "NewPassword1!");

        assertThat(refresh(deviceA.refreshToken(), new MockHttpServletResponse()).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(refresh(deviceB.refreshToken(), new MockHttpServletResponse()).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(liveSessionCount(jwtTokenProvider.getFamily(deviceA.refreshToken()))).isZero();
        assertThat(liveSessionCount(jwtTokenProvider.getFamily(deviceB.refreshToken()))).isZero();
    }

    private AuthResponse login() {
        return authService.login(new LoginRequest(STUDENT_ID, PASSWORD, false), "203.0.113.10");
    }

    private ResponseEntity<Void> refresh(String refreshToken, MockHttpServletResponse response) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("refreshToken", refreshToken));
        return authController.refresh(request, response);
    }

    private int liveSessionCount(String family) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM refresh_sessions WHERE family = ? AND revoked_at IS NULL",
                Integer.class, family);
        return count == null ? 0 : count;
    }

    private static String cookieValue(MockHttpServletResponse response, String name) {
        List<String> headers = response.getHeaders(HttpHeaders.SET_COOKIE);
        return headers.stream()
                .filter(header -> header.startsWith(name + "="))
                .map(header -> header.substring(name.length() + 1, header.indexOf(';')))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no " + name + " cookie in " + headers));
    }

    /** A refresh token shaped like the ones minted before refresh sessions existed: no family. */
    private static String legacyRefreshToken(String studentId, int tokenVersion) {
        return Jwts.builder()
                .subject(studentId)
                .issuer("coms-backend")
                .audience().add("coms-app").and()
                .id(UUID.randomUUID().toString())
                .claim("type", "refresh")
                .claim("remember", false)
                .claim("tv", tokenVersion)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS256)
                .compact();
    }
}
