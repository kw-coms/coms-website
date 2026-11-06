package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class MediaUploadValidatorTest {
    private final MediaUploadValidator validator = new MediaUploadValidator();

    @Test
    void pendingQuotaFitsMaximalBodyWithOneMoreBodyOfHeadroom() {
        int bodyCount = MediaUploadValidator.MAX_BODY_IMAGES + MediaUploadValidator.MAX_BODY_VIDEOS
                + MediaUploadValidator.MAX_BODY_FILES;
        long bodyBytes = MediaUploadValidator.MAX_BODY_IMAGES * MediaUploadValidator.MAX_IMAGE_BYTES
                + MediaUploadValidator.MAX_BODY_VIDEOS * MediaUploadValidator.MAX_VIDEO_BYTES
                + MediaUploadValidator.MAX_BODY_FILES * MediaUploadValidator.MAX_FILE_BYTES;

        assertThat(MediaUploadValidator.MAX_PENDING_COUNT).isEqualTo(2 * bodyCount);
        assertThat(MediaUploadValidator.MAX_PENDING_BYTES).isEqualTo(2 * bodyBytes);
        assertThat(bodyCount).isEqualTo(33);
        assertThat(bodyBytes).isEqualTo(900L * 1024 * 1024);
    }

    @Test
    void validatesImageSignatureAndRejectsDeclaredMismatch() {
        assertThat(validator.validateImage(file("a.gif", "image/gif", "GIF89a"))).isEqualTo("image/gif");
        assertThatThrownBy(() -> validator.validateImage(file("a.png", "image/png", "%PDF")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validator.validateImage(file("a.svg", "image/svg+xml", "<svg/>")))
                .isInstanceOf(ResponseStatusException.class);
    }

    @ParameterizedTest
    @CsvSource({"image,5242881", "video,104857601", "file,52428801"})
    void enforcesSizeBeforeReadingBytes(String kind, long size) {
        MockMultipartFile oversized = new MockMultipartFile("file", "a.png", "image/png", new byte[]{1}) {
            @Override public long getSize() { return size; }
        };
        assertThatThrownBy(() -> {
            switch (kind) {
                case "image" -> validator.validateImage(oversized);
                case "video" -> validator.validateVideo(oversized);
                default -> validator.validateFile(oversized);
            }
        }).isInstanceOf(ResponseStatusException.class).hasMessageContaining("MB");
    }

    @Test
    void acceptsDocumentsAndRejectsMismatchOrExecutableExtension() {
        assertThat(validator.validateFile(file("notes.pdf", "application/pdf", "%PDF-1.7"))).isEqualTo("application/pdf");
        assertThat(validator.validateFile(file("notes.hwp", "application/x-hwp", "document"))).isEqualTo("application/x-hwp");
        assertThatThrownBy(() -> validator.validateFile(file("bad.pdf", "application/pdf", "MZ")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validator.validateFile(file("bad.exe", "application/octet-stream", "MZ")))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(validator.validateFile(file("notes.txt", "text/html", "<script/>")))
                .isEqualTo("application/octet-stream");
        assertThat(validator.validateFile(file("notes.pdf", "application/pdf; charset=UTF-8", "%PDF-1.7")))
                .isEqualTo("application/pdf");
        assertThat(validator.validateFile(file("notes.pdf", "application/" + "x".repeat(110), "%PDF-1.7")))
                .isEqualTo("application/octet-stream");
    }

    @Test
    void canonicalExtensionsFollowValidatedImageAndVideoTypes() {
        assertThat(MediaUploadValidator.canonicalExtension("image/jpeg")).isEqualTo("jpg");
        assertThat(MediaUploadValidator.canonicalExtension("image/gif")).isEqualTo("gif");
        assertThat(MediaUploadValidator.canonicalExtension("video/quicktime")).isEqualTo("mov");
    }

    @Test
    void videoSignatureMustMatchDeclaredContainer() {
        byte[] mp4 = {0, 0, 0, 16, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0};
        byte[] mov = {0, 0, 0, 16, 'f', 't', 'y', 'p', 'q', 't', ' ', ' ', 0, 0, 0, 0};
        byte[] webm = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3};
        assertThat(validator.validateVideo(new MockMultipartFile("video", "a.mp4", "video/mp4", mp4))).isEqualTo("video/mp4");
        assertThat(validator.validateVideo(new MockMultipartFile("video", "a.mov", "video/quicktime", mov))).isEqualTo("video/quicktime");
        assertThat(validator.validateVideo(new MockMultipartFile("video", "a.webm", "video/webm", webm))).isEqualTo("video/webm");
        assertThatThrownBy(() -> validator.validateVideo(new MockMultipartFile("video", "a.mp4", "video/mp4", mov)))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validator.validateVideo(file("a.mp4", "video/mp4", "<html/>")))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rejectsMissingFilesAndCleansFilename() {
        assertThatThrownBy(() -> validator.validateFile(null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validator.validateImage(file("", "image/gif", "GIF89a")))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(MediaUploadValidator.cleanOriginalFilename(file("C:\\tmp\\notes\n.pdf", "application/pdf", "%PDF")))
                .isEqualTo("notes.pdf");
    }

    private MockMultipartFile file(String name, String type, String bytes) {
        return new MockMultipartFile("file", name, type, bytes.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
