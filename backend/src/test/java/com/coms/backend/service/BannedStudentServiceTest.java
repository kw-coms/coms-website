package com.coms.backend.service;

import com.coms.backend.domain.BannedStudent;
import com.coms.backend.dto.BanStudentRequest;
import com.coms.backend.repository.BannedStudentRepository;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:banned-student-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "mail.enabled=false"
})
class BannedStudentServiceTest {

    @Autowired
    private BannedStudentService bannedStudentService;

    @Autowired
    private BannedStudentRepository bannedStudentRepository;

    @Autowired
    private Validator validator;

    @BeforeEach
    void setUp() {
        bannedStudentRepository.deleteAll();
    }

    @ParameterizedTest
    @ValueSource(strings = {"6H", "12H", "24H", "3D", "7D", "31D", "3M", "6M", "1Y", "3Y"})
    void banAcceptsOnlyConfiguredTemporaryDurations(String duration) {
        String studentId = switch (duration) {
            case "6H" -> "2026000001";
            case "12H" -> "2026000002";
            case "24H" -> "2026000003";
            case "3D" -> "2026000004";
            case "7D" -> "2026000005";
            case "31D" -> "2026000006";
            case "3M" -> "2026000007";
            case "6M" -> "2026000008";
            case "1Y" -> "2026000009";
            default -> "2026000010";
        };

        bannedStudentService.ban(studentId, duration);

        BannedStudent saved = bannedStudentRepository.findByStudentId(studentId).orElseThrow();
        assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now());
    }

    @Test
    void banRejectsClientTamperedDurationValues() {
        assertThatThrownBy(() -> bannedStudentService.ban("2026123456", "999Y"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(ex.getReason()).contains("허용되지 않은");
                });

        assertThat(bannedStudentRepository.existsByStudentId("2026123456")).isFalse();
    }

    @Test
    void banRequestRejectsMalformedStudentIdsBeforeServiceExecution() {
        var violations = validator.validate(new BanStudentRequest("../admin", "6H"));

        assertThat(violations).isNotEmpty();
    }

    @Test
    void banRejectsDuplicateActiveBan() {
        bannedStudentService.ban("2026123456", "6H");

        assertThatThrownBy(() -> bannedStudentService.ban("2026123456", "12H"))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void expiredBanNoLongerBlocksAndIsDeleted() {
        bannedStudentRepository.save(new BannedStudent("2026123456", LocalDateTime.now().minusMinutes(1)));

        assertThat(bannedStudentService.isBanned("2026123456")).isFalse();
        assertThat(bannedStudentRepository.existsByStudentId("2026123456")).isFalse();
    }
}
