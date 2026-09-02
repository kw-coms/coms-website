package com.coms.backend.service;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Magic-byte sniffing for uploads.
 *
 * <p>Both the filename extension and the {@code Content-Type} of a multipart part are supplied by
 * the client, so neither says anything about what the bytes actually are: {@code payload.exe.zip}
 * sent as {@code application/zip} passed every check we had. This reads the first bytes of the
 * upload and reports what the content really is, so callers can reject the mismatch.
 *
 * <p>Only formats with a reliable, unambiguous signature are covered. Extensions we cannot verify
 * (plain text, OLE-based office documents, video containers) are reported as "no opinion" rather
 * than guessed at — a false rejection would break legitimate uploads.
 */
final class UploadSniffer {

    /** Enough for every signature below; WebP needs 12. */
    private static final int HEADER_BYTES = 16;

    private static final byte[] ZIP_LOCAL_FILE = {0x50, 0x4B, 0x03, 0x04};  // "PK\3\4"
    private static final byte[] ZIP_EMPTY = {0x50, 0x4B, 0x05, 0x06};       // "PK\5\6" — empty archive
    private static final byte[] PDF = {0x25, 0x50, 0x44, 0x46};             // "%PDF"
    private static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] GIF = {0x47, 0x49, 0x46, 0x38};             // "GIF8" (87a and 89a)
    private static final byte[] RIFF = {0x52, 0x49, 0x46, 0x46};            // "RIFF"
    private static final byte[] WEBP = {0x57, 0x45, 0x42, 0x50};            // "WEBP" at offset 8

    private UploadSniffer() {
    }

    /** The four image formats we are willing to store and serve inline. */
    enum ImageType {
        PNG("image/png"),
        JPEG("image/jpeg"),
        GIF("image/gif"),
        WEBP("image/webp");

        private final String mimeType;

        ImageType(String mimeType) {
            this.mimeType = mimeType;
        }

        String mimeType() {
            return mimeType;
        }
    }

    /**
     * Reads the leading bytes of {@code file}. An unreadable upload yields an empty array, which
     * every {@code isX}/{@code imageType} check below treats as "not a match" — failing closed.
     */
    static byte[] header(MultipartFile file) {
        if (file == null) {
            return new byte[0];
        }
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(HEADER_BYTES);
        } catch (IOException e) {
            return new byte[0];
        }
    }

    /** True for a real ZIP container: a local file entry, or the empty-archive end record. */
    static boolean isZip(byte[] header) {
        return startsWith(header, ZIP_LOCAL_FILE) || startsWith(header, ZIP_EMPTY);
    }

    static boolean isPdf(byte[] header) {
        return startsWith(header, PDF);
    }

    /** The sniffed image format, or {@code null} when the bytes are not one of the four. */
    static ImageType imageType(byte[] header) {
        if (startsWith(header, PNG)) return ImageType.PNG;
        if (startsWith(header, JPEG)) return ImageType.JPEG;
        if (startsWith(header, GIF)) return ImageType.GIF;
        if (startsWith(header, RIFF) && regionMatches(header, 8, WEBP)) return ImageType.WEBP;
        return null;
    }

    /**
     * Whether the content is consistent with {@code extension}. Extensions without a dependable
     * signature return {@code true} — this is a mismatch detector, not an allowlist.
     */
    static boolean matchesExtension(String extension, byte[] header) {
        if (extension == null) {
            return true;
        }
        return switch (extension.toLowerCase(Locale.ROOT)) {
            case "zip" -> isZip(header);
            case "pdf" -> isPdf(header);
            case "png" -> imageType(header) == ImageType.PNG;
            case "jpg", "jpeg" -> imageType(header) == ImageType.JPEG;
            case "gif" -> imageType(header) == ImageType.GIF;
            case "webp" -> imageType(header) == ImageType.WEBP;
            default -> true;
        };
    }

    private static boolean startsWith(byte[] header, byte[] signature) {
        return regionMatches(header, 0, signature);
    }

    private static boolean regionMatches(byte[] header, int offset, byte[] signature) {
        if (header == null || header.length < offset + signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (header[offset + i] != signature[i]) {
                return false;
            }
        }
        return true;
    }
}
