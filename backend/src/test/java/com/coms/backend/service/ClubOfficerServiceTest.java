package com.coms.backend.service;

import com.coms.backend.domain.ClubOfficerTerm;
import com.coms.backend.dto.ClubOfficerDto.TermWrite;
import com.coms.backend.repository.ClubOfficerRepository;
import com.coms.backend.repository.ClubOfficerTermRepository;
import com.coms.backend.repository.EligibleMemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 무결성 위반을 409 로 바꾸는 것은 라벨 유일 제약일 때만이다. 경합은 통합 테스트로 만들 수 없어 저장소를 흉내 낸다. */
class ClubOfficerServiceTest {
    private final ClubOfficerTermRepository terms = mock(ClubOfficerTermRepository.class);
    private final ClubOfficerService service =
            new ClubOfficerService(terms, mock(ClubOfficerRepository.class), mock(EligibleMemberRepository.class));

    private void saveFailsWith(String message) {
        when(terms.findByLabel(any())).thenReturn(Optional.empty());
        when(terms.findByYear(2026)).thenReturn(List.of());
        when(terms.saveAndFlush(any(ClubOfficerTerm.class)))
                .thenThrow(new DataIntegrityViolationException("could not execute statement",
                        new RuntimeException(message)));
    }

    @Test
    void labelConstraintBecomes409InH2AndPostgresSpelling() {
        for (String message : List.of(
                "Unique index or primary key violation: \"PUBLIC.UQ_CLUB_OFFICER_TERMS_LABEL_INDEX_2 ON PUBLIC.CLUB_OFFICER_TERMS(LABEL)\"",
                "ERROR: duplicate key value violates unique constraint \"uq_club_officer_terms_label\"")) {
            saveFailsWith(message);
            assertThatThrownBy(() -> service.createTerm(new TermWrite("70대", 2026, null, "")))
                    .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                        assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                        assertThat(e.getReason()).isEqualTo("같은 대수가 이미 있습니다.");
                    });
        }
    }

    @Test
    void otherIntegrityViolationsAreRethrown() {
        saveFailsWith("ERROR: value too long for type character varying(20)");
        assertThatThrownBy(() -> service.createTerm(new TermWrite("70대", 2026, null, "")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
