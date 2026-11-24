package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.repository.ClubProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ClubProjectDetailVisibilityTest {
    @Test
    void guestCannotReadProjectRequeuedDuringViewCountUpdate() {
        ClubProjectRepository projects = mock(ClubProjectRepository.class);
        ClubProject approved = new ClubProject();
        ClubProject pending = new ClubProject();
        pending.setReviewStatus(ClubProject.ReviewStatus.PENDING);
        when(projects.findById(1L)).thenReturn(Optional.of(approved), Optional.of(pending));
        when(projects.incrementViewCount(1L)).thenReturn(1);
        ClubProjectService service = new ClubProjectService(projects, null, null, null, null,
                null, null, null, null);

        assertThatThrownBy(() -> service.detail(1L, null, false))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(404));
        verify(projects).incrementViewCount(1L);
        verify(projects, times(2)).findById(1L);
    }
}
