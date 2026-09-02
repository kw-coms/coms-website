package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;

class UploadSnifferTest {

    private static final byte[] ZIP = {0x50, 0x4B, 0x03, 0x04, 0x14, 0x00};
    private static final byte[] EMPTY_ZIP = {0x50, 0x4B, 0x05, 0x06, 0x00, 0x00};
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46, 0x2D, 0x31};
    private static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
    private static final byte[] GIF = {0x47, 0x49, 0x46, 0x38, 0x39, 0x61};
    // "RIFF" + 4 size bytes + "WEBP"
    private static final byte[] WEBP = {0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50};
    // MZ — a Windows executable renamed to .zip
    private static final byte[] EXECUTABLE = {0x4D, 0x5A, (byte) 0x90, 0x00};

    @Test
    void detectsZipIncludingTheEmptyArchiveRecord() {
        assertThat(UploadSniffer.isZip(ZIP)).isTrue();
        assertThat(UploadSniffer.isZip(EMPTY_ZIP)).isTrue();
        assertThat(UploadSniffer.isZip(EXECUTABLE)).isFalse();
        assertThat(UploadSniffer.isZip(new byte[0])).isFalse();
    }

    @Test
    void detectsPdf() {
        assertThat(UploadSniffer.isPdf(PDF)).isTrue();
        assertThat(UploadSniffer.isPdf(ZIP)).isFalse();
    }

    @Test
    void detectsTheFourInlineImageFormats() {
        assertThat(UploadSniffer.imageType(PNG)).isEqualTo(UploadSniffer.ImageType.PNG);
        assertThat(UploadSniffer.imageType(JPEG)).isEqualTo(UploadSniffer.ImageType.JPEG);
        assertThat(UploadSniffer.imageType(GIF)).isEqualTo(UploadSniffer.ImageType.GIF);
        assertThat(UploadSniffer.imageType(WEBP)).isEqualTo(UploadSniffer.ImageType.WEBP);
    }

    @Test
    void rejectsRiffContainersThatAreNotWebp() {
        // RIFF....WAVE — a RIFF header alone must not be accepted as an image.
        byte[] wav = {0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45};
        assertThat(UploadSniffer.imageType(wav)).isNull();
    }

    @Test
    void reportsNoImageForHtmlAndTruncatedContent() {
        assertThat(UploadSniffer.imageType("<html><script>".getBytes())).isNull();
        assertThat(UploadSniffer.imageType(new byte[]{(byte) 0xFF, (byte) 0xD8})).isNull();
        assertThat(UploadSniffer.imageType(new byte[0])).isNull();
    }

    @Test
    void matchesExtensionCatchesTheDoubleExtensionBypass() {
        // payload.exe.zip — the classic bypass: the name ends in .zip, the bytes do not.
        assertThat(UploadSniffer.matchesExtension("zip", EXECUTABLE)).isFalse();
        assertThat(UploadSniffer.matchesExtension("zip", ZIP)).isTrue();
        assertThat(UploadSniffer.matchesExtension("PNG", PNG)).isTrue();
        assertThat(UploadSniffer.matchesExtension("png", JPEG)).isFalse();
    }

    @Test
    void matchesExtensionStaysNeutralForFormatsWithoutASignature() {
        // No dependable magic for these — rejecting them would break legitimate uploads.
        assertThat(UploadSniffer.matchesExtension("txt", EXECUTABLE)).isTrue();
        assertThat(UploadSniffer.matchesExtension("hwp", EXECUTABLE)).isTrue();
        assertThat(UploadSniffer.matchesExtension("mp4", EXECUTABLE)).isTrue();
        assertThat(UploadSniffer.matchesExtension(null, EXECUTABLE)).isTrue();
    }

    @Test
    void headerReadsLeadingBytesAndFailsClosedOnAnEmptyUpload() {
        MockMultipartFile file = new MockMultipartFile("file", "a.zip", "application/zip", ZIP);
        assertThat(UploadSniffer.isZip(UploadSniffer.header(file))).isTrue();
        assertThat(UploadSniffer.header(null)).isEmpty();
    }
}
