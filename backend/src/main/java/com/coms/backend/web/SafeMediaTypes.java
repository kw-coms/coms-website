package com.coms.backend.web;

import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;

import java.util.Locale;
import java.util.Set;

/**
 * Chooses the {@code Content-Type} for files that members uploaded and others download.
 *
 * <p>The stored type is whatever the uploading browser claimed. {@code Content-Disposition:
 * attachment} stops a navigation from rendering the file, but not a {@code <script src>} or
 * {@code <link rel=stylesheet>} pointing at the download URL: served back as a script or style
 * type from our own origin, an upload would satisfy the site's {@code script-src 'self'}. So only
 * types that browsers treat as passive data keep their declared type; everything else goes out
 * as {@code application/octet-stream}.
 */
public final class SafeMediaTypes {

    private static final Set<String> PASSIVE_APPLICATION_SUBTYPES = Set.of(
            "pdf", "zip", "x-zip-compressed", "msword", "vnd.ms-excel", "vnd.ms-powerpoint",
            "x-hwp", "haansofthwp", "vnd.hancom.hwp", "vnd.hancom.hwpx", "vnd.android.package-archive");
    private static final Set<String> PASSIVE_TEXT_SUBTYPES = Set.of("plain", "csv", "markdown");

    private SafeMediaTypes() {
    }

    /** The stored type when it parses, otherwise {@code application/octet-stream}. */
    public static MediaType parseOrOctetStream(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    /** The type to send with an attachment download of an uploaded file. */
    public static MediaType forDownload(String mimeType) {
        MediaType parsed = parseOrOctetStream(mimeType);
        return isPassive(parsed) ? parsed : MediaType.APPLICATION_OCTET_STREAM;
    }

    private static boolean isPassive(MediaType mediaType) {
        String type = mediaType.getType().toLowerCase(Locale.ROOT);
        String subtype = mediaType.getSubtype().toLowerCase(Locale.ROOT);
        return switch (type) {
            // SVG is an image type that can carry script.
            case "image" -> !subtype.contains("svg");
            case "video", "audio" -> true;
            case "text" -> PASSIVE_TEXT_SUBTYPES.contains(subtype);
            case "application" -> PASSIVE_APPLICATION_SUBTYPES.contains(subtype)
                    || subtype.startsWith("vnd.openxmlformats-officedocument.");
            default -> false;
        };
    }
}
