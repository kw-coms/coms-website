package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Image uploads are re-encoded to drop their metadata. These tests pin what must survive that:
 * the picture the right way up.
 */
class LocalStorageServiceTest {

    @TempDir
    Path uploads;

    @Test
    void failedRawCopyRemovesItsPartialFileAndKeepsOtherUploads() throws Exception {
        Files.writeString(uploads.resolve("preserved.txt"), "existing contents");
        IOException failure = new IOException("upload stream interrupted");
        MockMultipartFile file = new MockMultipartFile("files", "partial.pdf", "application/pdf", new byte[]{1, 2}) {
            @Override
            public InputStream getInputStream() {
                return new InputStream() {
                    private boolean copied;

                    @Override
                    public int read(byte[] bytes, int offset, int length) throws IOException {
                        if (copied) {
                            try (var paths = Files.list(uploads)) {
                                assertThat(paths.count()).isEqualTo(2);
                            }
                            throw failure;
                        }
                        copied = true;
                        bytes[offset] = 1;
                        return 1;
                    }

                    @Override
                    public int read() throws IOException {
                        byte[] bytes = new byte[1];
                        return read(bytes, 0, 1) == -1 ? -1 : bytes[0];
                    }
                };
            }
        };
        LocalStorageService storage = new LocalStorageService(uploads.toString());
        assertThatThrownBy(() -> storage.store(file)).isSameAs(failure);
        try (var paths = Files.list(uploads)) {
            assertThat(paths.map(path -> path.getFileName().toString()).toList()).containsExactly("preserved.txt");
        }
        assertThat(Files.readString(uploads.resolve("preserved.txt"))).isEqualTo("existing contents");
    }

    /** 40x20, left half red and right half blue — so every orientation is distinguishable. */
    private static byte[] jpeg(Integer exifOrientation, boolean littleEndian) throws Exception {
        BufferedImage image = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 20, 20);
        g.setColor(Color.BLUE);
        g.fillRect(20, 0, 20, 20);
        g.dispose();
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", encoded);
        byte[] plain = encoded.toByteArray();
        if (exifOrientation == null) {
            return plain;
        }
        byte[] exif = exifSegment(exifOrientation, littleEndian);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(plain, 0, 2);                    // SOI
        out.write(exif);                           // APP1 goes right after it
        out.write(plain, 2, plain.length - 2);
        return out.toByteArray();
    }

    private static byte[] exifSegment(int orientation, boolean littleEndian) {
        byte o = (byte) orientation;
        byte[] tiff = littleEndian
                ? new byte[]{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0, 0, 0, 0, 0}
                : new byte[]{'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0};
        ByteArrayOutputStream segment = new ByteArrayOutputStream();
        segment.write(0xFF);
        segment.write(0xE1);
        int length = 2 + 6 + tiff.length;
        segment.write(length >> 8);
        segment.write(length & 0xFF);
        segment.writeBytes("Exif\0\0".getBytes(StandardCharsets.US_ASCII));
        segment.writeBytes(tiff);
        return segment.toByteArray();
    }

    private BufferedImage storeAndReadBack(byte[] upload) throws Exception {
        LocalStorageService storage = new LocalStorageService(uploads.toString());
        String stored = storage.storeImage(new MockMultipartFile("image", "photo.jpg", "image/jpeg", upload), "image/jpeg");
        byte[] bytes = Files.readAllBytes(uploads.resolve(stored));
        // Whatever the upload carried, the stored file carries no EXIF.
        assertThat(new String(bytes, StandardCharsets.ISO_8859_1)).doesNotContain("Exif");
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    private static boolean red(BufferedImage image, int x, int y) {
        Color c = new Color(image.getRGB(x, y));
        return c.getRed() > 150 && c.getBlue() < 100;
    }

    private static boolean blue(BufferedImage image, int x, int y) {
        Color c = new Color(image.getRGB(x, y));
        return c.getBlue() > 150 && c.getRed() < 100;
    }

    @Test
    void photoWithoutOrientationIsStoredAsItIs() throws Exception {
        for (byte[] upload : new byte[][]{jpeg(null, false), jpeg(1, false)}) {
            BufferedImage stored = storeAndReadBack(upload);
            assertThat(stored.getWidth()).isEqualTo(40);
            assertThat(stored.getHeight()).isEqualTo(20);
            assertThat(red(stored, 5, 10)).isTrue();
            assertThat(blue(stored, 35, 10)).isTrue();
        }
    }

    @Test
    void portraitPhotoIsStoredUprightOnceItsOrientationTagIsGone() throws Exception {
        // Orientation 6 is the usual phone-held-upright case: landscape pixels meant to be shown
        // turned a quarter clockwise. The left edge of the stored pixels is the top of the photo.
        BufferedImage quarterClockwise = storeAndReadBack(jpeg(6, false));
        assertThat(quarterClockwise.getWidth()).isEqualTo(20);
        assertThat(quarterClockwise.getHeight()).isEqualTo(40);
        assertThat(red(quarterClockwise, 10, 5)).isTrue();
        assertThat(blue(quarterClockwise, 10, 35)).isTrue();

        BufferedImage quarterCounterClockwise = storeAndReadBack(jpeg(8, true));
        assertThat(quarterCounterClockwise.getWidth()).isEqualTo(20);
        assertThat(quarterCounterClockwise.getHeight()).isEqualTo(40);
        assertThat(blue(quarterCounterClockwise, 10, 5)).isTrue();
        assertThat(red(quarterCounterClockwise, 10, 35)).isTrue();

        BufferedImage upsideDown = storeAndReadBack(jpeg(3, false));
        assertThat(upsideDown.getWidth()).isEqualTo(40);
        assertThat(upsideDown.getHeight()).isEqualTo(20);
        assertThat(blue(upsideDown, 5, 10)).isTrue();
        assertThat(red(upsideDown, 35, 10)).isTrue();

        BufferedImage mirrored = storeAndReadBack(jpeg(2, true));
        assertThat(mirrored.getWidth()).isEqualTo(40);
        assertThat(blue(mirrored, 5, 10)).isTrue();
        assertThat(red(mirrored, 35, 10)).isTrue();
    }

    @Test
    void everyOrientationFillsTheWholeFrame() {
        // A wrong transform shows up as an unpainted (black) strip along one edge.
        BufferedImage source = new BufferedImage(7, 3, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = source.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 7, 3);
        g.dispose();

        for (int orientation = 1; orientation <= 8; orientation++) {
            BufferedImage turned = LocalStorageService.upright(source, orientation);
            boolean quarterTurn = orientation >= 5;
            assertThat(turned.getWidth()).as("orientation %d width", orientation).isEqualTo(quarterTurn ? 3 : 7);
            assertThat(turned.getHeight()).as("orientation %d height", orientation).isEqualTo(quarterTurn ? 7 : 3);
            for (int x = 0; x < turned.getWidth(); x++) {
                for (int y = 0; y < turned.getHeight(); y++) {
                    assertThat(turned.getRGB(x, y) & 0xFFFFFF)
                            .as("orientation %d pixel (%d,%d)", orientation, x, y)
                            .isEqualTo(0xFFFFFF);
                }
            }
        }
    }

    @Test
    void readsOrientationInEitherByteOrderAndIgnoresWhatItCannotRead() throws Exception {
        assertThat(LocalStorageService.jpegOrientation(jpeg(6, false))).isEqualTo(6);
        assertThat(LocalStorageService.jpegOrientation(jpeg(6, true))).isEqualTo(6);
        assertThat(LocalStorageService.jpegOrientation(jpeg(8, true))).isEqualTo(8);
        assertThat(LocalStorageService.jpegOrientation(jpeg(null, false))).isEqualTo(1);
        // Out-of-range values, other formats, and truncated data all mean "leave it alone".
        assertThat(LocalStorageService.jpegOrientation(jpeg(9, false))).isEqualTo(1);
        assertThat(LocalStorageService.jpegOrientation(new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10})).isEqualTo(1);
        assertThat(LocalStorageService.jpegOrientation(new byte[0])).isEqualTo(1);
        // The orientation entry ends at byte 34 of this file; any shorter prefix must not be read past.
        byte[] whole = jpeg(6, false);
        for (int cut = 0; cut < 34; cut++) {
            assertThat(LocalStorageService.jpegOrientation(java.util.Arrays.copyOf(whole, cut)))
                    .as("first %d bytes", cut).isEqualTo(1);
        }
        assertThat(LocalStorageService.jpegOrientation(java.util.Arrays.copyOf(whole, 34))).isEqualTo(6);
    }

    @Test
    void webpMetadataChunksAreDroppedAndTheirFlagsCleared() {
        byte[] vp8x = new byte[10];
        vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF + XMP + alpha
        byte[] webp = webp(
                chunk("VP8X", vp8x),
                chunk("VP8L", new byte[]{1, 2, 3, 4, 5}), // odd length: padded
                chunk("EXIF", "GPS 37.6 127.0".getBytes(StandardCharsets.US_ASCII)),
                chunk("XMP ", "<x:xmpmeta/>".getBytes(StandardCharsets.US_ASCII)));

        byte[] stripped = LocalStorageService.stripWebpMetadata(webp);

        String text = new String(stripped, StandardCharsets.ISO_8859_1);
        assertThat(text).startsWith("RIFF").contains("WEBP").contains("VP8X").contains("VP8L")
                .doesNotContain("EXIF").doesNotContain("XMP ").doesNotContain("GPS");
        assertThat(stripped[20] & 0xFF).as("VP8X flags").isEqualTo(0x10);
        long riffSize = (stripped[4] & 0xFFL) | (stripped[5] & 0xFFL) << 8
                | (stripped[6] & 0xFFL) << 16 | (stripped[7] & 0xFFL) << 24;
        assertThat(riffSize).isEqualTo(stripped.length - 8L);
    }

    @Test
    void webpWithoutMetadataIsReturnedUnchangedAndBrokenFilesAreRejected() {
        byte[] plain = webp(chunk("VP8L", new byte[]{1, 2, 3, 4}));
        assertThat(LocalStorageService.stripWebpMetadata(plain)).isSameAs(plain);

        assertThat(LocalStorageService.stripWebpMetadata("not a webp file".getBytes(StandardCharsets.US_ASCII))).isNull();
        byte[] truncated = java.util.Arrays.copyOf(plain, plain.length - 3);
        assertThat(LocalStorageService.stripWebpMetadata(truncated)).isNull();
    }

    private static byte[] webp(byte[]... chunks) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.writeBytes("WEBP".getBytes(StandardCharsets.US_ASCII));
        for (byte[] chunk : chunks) {
            body.writeBytes(chunk);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes("RIFF".getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(le32(body.size()));
        out.writeBytes(body.toByteArray());
        return out.toByteArray();
    }

    private static byte[] chunk(String fourcc, byte[] data) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(fourcc.getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(le32(data.length));
        out.writeBytes(data);
        if ((data.length & 1) == 1) {
            out.write(0);
        }
        return out.toByteArray();
    }

    private static byte[] le32(int value) {
        return new byte[]{(byte) value, (byte) (value >>> 8), (byte) (value >>> 16), (byte) (value >>> 24)};
    }
}
