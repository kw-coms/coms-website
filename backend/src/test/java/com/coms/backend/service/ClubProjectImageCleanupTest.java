package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.domain.ClubProjectImage;
import com.coms.backend.repository.ClubProjectFileRepository;
import com.coms.backend.repository.ClubProjectImageRepository;
import com.coms.backend.repository.ClubProjectRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ClubProjectImageCleanupTest {
    @Test
    void secondUploadFailureDeletesTheFirstStoredBlob() throws Exception {
        ClubProjectRepository projects = mock(ClubProjectRepository.class);
        ClubProjectImageRepository images = mock(ClubProjectImageRepository.class);
        StorageService storage = mock(StorageService.class);
        ClubProject project = new ClubProject();
        Field id = ClubProject.class.getDeclaredField("id");
        id.setAccessible(true);
        id.set(project, 10L);
        when(projects.findById(10L)).thenReturn(Optional.of(project));
        when(images.findByClubProjectIdOrderByPositionAsc(10L)).thenReturn(List.of());
        when(images.save(any())).thenReturn(mock(ClubProjectImage.class));
        when(storage.storeImage(any(), any())).thenReturn("first-blob")
                .thenThrow(new IOException("disk full"));
        ClubProjectService service = new ClubProjectService(projects, mock(ClubProjectFileRepository.class),
                images, mock(MemberRepository.class), mock(ClubProjectCategoryService.class), storage);
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=");
        var upload = new MockMultipartFile("images", "image.png", "image/png", png);

        assertThatThrownBy(() -> service.addImages(10L, List.of(upload, upload)))
                .isInstanceOf(ResponseStatusException.class);
        verify(storage).delete("first-blob");
    }
}
