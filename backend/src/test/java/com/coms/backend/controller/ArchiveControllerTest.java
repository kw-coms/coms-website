package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.domain.ArchiveAttachment;
import com.coms.backend.service.ArchiveService;
import com.coms.backend.service.StorageService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import org.springframework.security.authentication.TestingAuthenticationToken;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

    @Test
    void aTypeThatIsNotRenderedInlineIsNotAnnouncedEither() {
        // "attachment" does not stop a page from loading the URL as a script or a stylesheet, and
        // a script type would pass both nosniff and script-src 'self'.
        for (String declared : new String[] {"text/javascript", "text/css", "text/html", "image/svg+xml"}) {
            ArchiveFile file = file("upload.bin", "stored-upload.bin", declared);
            when(archiveService.get(2L)).thenReturn(file);
            when(storageService.load("stored-upload.bin")).thenReturn(new ByteArrayResource("x".getBytes()));

            var inline = controller.inline(2L);

            assertThat(inline.getHeaders().getContentType()).as(declared)
                    .isEqualTo(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM);
            assertThat(inline.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).as(declared).contains("attachment");
        }

        ArchiveFile image = file("photo.png", "stored-photo.png", "image/png");
        when(archiveService.get(3L)).thenReturn(image);
        when(storageService.load("stored-photo.png")).thenReturn(new ByteArrayResource("x".getBytes()));
        assertThat(controller.inline(3L).getHeaders().getContentType()).isEqualTo(org.springframework.http.MediaType.IMAGE_PNG);
    }

    @Test
    void attachmentDownloadUsesChildBlobWithPrivateNoStoreHeaders() {
        ArchiveAttachment attachment = new ArchiveAttachment(1L, "second.pdf", "stored-second.pdf", "application/pdf", 12, 1);
        when(archiveService.getAttachment(1L, 2L)).thenReturn(attachment);
        when(storageService.load("stored-second.pdf")).thenReturn(new ByteArrayResource("%PDF-1.4".getBytes()));

        var response = controller.downloadAttachment(1L, 2L);

        assertThat(response.getHeaders().getCacheControl()).contains("no-store", "private");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment", "second.pdf");
        assertThat(response.getBody()).isNotNull();
        org.mockito.Mockito.verify(archiveService).incrementView(1L);
    }

    @Test
    void multipartPostWithTwoFilesCallsOneGroupUpload() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        MockMultipartFile first = new MockMultipartFile("files", "one.pdf", "application/pdf", "%PDF-1.4 one".getBytes());
        MockMultipartFile second = new MockMultipartFile("files", "two.pdf", "application/pdf", "%PDF-1.4 two".getBytes());

        mvc.perform(multipart("/api/files").file(first).file(second).param("title", "중간 족보")
                        .principal(new TestingAuthenticationToken("2026123456", "password")))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(archiveService).uploadGroup(org.mockito.ArgumentMatchers.eq("중간 족보"),
                org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq("GENERAL"),
                org.mockito.ArgumentMatchers.argThat(files -> files.size() == 2),
                org.mockito.ArgumentMatchers.eq("2026123456"));
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
