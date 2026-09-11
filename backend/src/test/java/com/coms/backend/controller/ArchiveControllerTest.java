package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.service.ArchiveService;
import com.coms.backend.service.StorageService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ArchiveControllerTest {

    private final ArchiveService archiveService = mock(ArchiveService.class);
    private final StorageService storageService = mock(StorageService.class);
    private final ArchiveController controller = new ArchiveController(archiveService, storageService);

    @Test
    void bareDownloadAndInlineUrlsArePrivateNoStoreBecauseArchiveBytesCanBeReplaced() {
        ArchiveFile file = file("versioned.pdf", "stored-versioned.pdf", "application/pdf");
        when(archiveService.get(1L)).thenReturn(file);
        when(storageService.load("stored-versioned.pdf")).thenReturn(new ByteArrayResource("%PDF-1.4".getBytes()));

        var download = controller.download(1L);
        var inline = controller.inline(1L);

        assertThat(download.getHeaders().getCacheControl()).contains("no-store", "private");
        assertThat(inline.getHeaders().getCacheControl()).contains("no-store", "private");
        assertThat(download.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment");
        assertThat(inline.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("inline");
    }

    private ArchiveFile file(String originalName, String storedName, String mimeType) {
        ArchiveFile file = new ArchiveFile();
        file.setOriginalName(originalName);
        file.setStoredName(storedName);
        file.setMimeType(mimeType);
        file.setFileSize(8L);
        file.setUploadedBy("2026123456");
        file.setUploaderName("홍길동");
        file.setTitle("자료");
        file.setCategory(ArchiveFile.Category.GENERAL);
        return file;
    }
}
