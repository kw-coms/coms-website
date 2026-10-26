package com.coms.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Iterator;
import java.util.UUID;

@Service
public class LocalStorageService implements StorageService {

    /** Reject images whose decoded pixel count would exceed this, to bound heap use (decompression bomb). */
    private static final long MAX_PIXELS = 50L * 1024 * 1024; // 50 megapixels
    /** The EXIF block sits in the first segments of a JPEG; a segment is at most 64 KB. */
    private static final int JPEG_HEAD_BYTES = 256 * 1024;

    /** Uploads stop before the disk does: a full disk also stops the database and the site. */
    private static final long DEFAULT_MIN_FREE_BYTES = 500L * 1024 * 1024;

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(LocalStorageService.class);

    private final Path root;
    private final long minFreeBytes;

    public LocalStorageService(String location) {
        this(location, DEFAULT_MIN_FREE_BYTES);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public LocalStorageService(@Value("${storage.location:./uploads}") String location,
                               @Value("${storage.min-free-bytes:524288000}") long minFreeBytes) {
        this.root = Paths.get(location).toAbsolutePath().normalize();
        this.minFreeBytes = Math.max(0, minFreeBytes);
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize storage directory", e);
        }
    }

    private void ensureRoomFor(long incomingBytes) {
        long usable;
        try {
            usable = Files.getFileStore(root).getUsableSpace();
        } catch (IOException e) {
            // Cannot tell: let the write itself fail if the disk really is full.
            log.warn("Could not read free space for {}", root, e);
            return;
        }
        if (usable - Math.max(0, incomingBytes) < minFreeBytes) {
            log.error("Upload refused: {} bytes free on the upload disk, {} kept in reserve", usable, minFreeBytes);
            throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE,
                    "서버 저장 공간이 부족해 파일을 올릴 수 없습니다. 운영진에게 알려주세요.");
        }
    }

    @Override
    public String store(MultipartFile file) throws IOException {
        String originalName = cleanOriginalFilename(file);
        if (file.isEmpty() || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty or missing a filename.");
        }
        ensureRoomFor(file.getSize());

        String stored = UUID.randomUUID() + "_" + originalName;
        Path destination = root.resolve(stored).normalize();
        if (!destination.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid filename.");
        }

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, destination);
        } catch (FileAlreadyExistsException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            try {
                Files.deleteIfExists(destination);
            } catch (IOException cleanupFailure) {
                e.addSuppressed(cleanupFailure);
            }
            throw e;
        }
        return stored;
    }

    @Override
    public String storeImage(MultipartFile file, String contentType) throws IOException {
        String originalName = cleanOriginalFilename(file);
        if (file.isEmpty() || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty or missing a filename.");
        }

        ensureRoomFor(file.getSize());
        byte[] sanitized = stripImageMetadata(file, contentType);
        if (sanitized == null && "image/webp".equals(contentType)) {
            // ImageIO cannot re-encode WebP, but its metadata lives in separate EXIF / XMP chunks
            // that can be dropped without touching the picture.
            sanitized = stripWebpMetadata(file.getBytes());
        }
        if (sanitized == null) {
            // ImageIO has no safe re-encoder for this format (GIF) so metadata cannot be
            // stripped here; the raw bytes are stored as-is. Callers requiring the stripping
            // guarantee must restrict uploads to JPEG/PNG/WebP at the API layer.
            return store(file);
        }

        String stored = UUID.randomUUID() + "_" + originalName;
        Path destination = root.resolve(stored).normalize();
        if (!destination.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid filename.");
        }

        Files.write(destination, sanitized);
        return stored;
    }

    /**
     * Decodes the image to a pixel buffer and re-encodes it, dropping every metadata block
     * (EXIF GPS coordinates, camera/device identifiers, timestamps). The header dimensions are
     * checked before the full decode so an attacker cannot exhaust heap with a small file that
     * expands to a huge pixel buffer (decompression bomb). Returns {@code null} for formats ImageIO
     * cannot losslessly re-write so the caller can fall back to a raw copy.
     */
    private byte[] stripImageMetadata(MultipartFile file, String contentType) throws IOException {
        String format = reencodeFormat(contentType);
        if (format == null) {
            return null;
        }
        BufferedImage image;
        try (InputStream in = file.getInputStream();
             ImageInputStream iis = ImageIO.createImageInputStream(in)) {
            if (iis == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > MAX_PIXELS) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image dimensions are too large.");
                }
                image = reader.read(0);
            } finally {
                reader.dispose();
            }
        }
        if (image == null) {
            return null;
        }
        if ("jpg".equals(format)) {
            // The metadata dropped below includes the tag that says which way is up. Cameras
            // store portrait shots as landscape pixels plus that tag, so without baking the
            // rotation in first, every such photo came out lying on its side.
            image = upright(image, jpegOrientation(head(file)));
        }
        BufferedImage target = image;
        if ("jpg".equals(format) && image.getColorModel().hasAlpha()) {
            // JPEG has no alpha channel; flatten onto white to avoid a corrupt write.
            target = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = target.createGraphics();
            try {
                g.drawImage(image, 0, 0, Color.WHITE, null);
            } finally {
                g.dispose();
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!ImageIO.write(target, format, out)) {
            return null;
        }
        return out.toByteArray();
    }

    private static byte[] head(MultipartFile file) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(JPEG_HEAD_BYTES);
        }
    }

    /**
     * The EXIF orientation (1–8) recorded in a JPEG, or 1 ("as stored") when there is none or the
     * data cannot be read. Package-private for unit testing.
     */
    static int jpegOrientation(byte[] jpeg) {
        if (jpeg.length < 4 || (jpeg[0] & 0xFF) != 0xFF || (jpeg[1] & 0xFF) != 0xD8) {
            return 1;
        }
        int pos = 2;
        while (pos + 4 <= jpeg.length) {
            if ((jpeg[pos] & 0xFF) != 0xFF) {
                return 1;
            }
            int marker = jpeg[pos + 1] & 0xFF;
            if (marker == 0xFF) {   // fill byte before a marker
                pos++;
                continue;
            }
            if (marker == 0xDA || marker == 0xD9) {   // image data starts: no EXIF past this point
                return 1;
            }
            int length = ((jpeg[pos + 2] & 0xFF) << 8) | (jpeg[pos + 3] & 0xFF);
            if (length < 2) {
                return 1;
            }
            int payload = pos + 4;
            if (marker == 0xE1 && payload + 6 <= jpeg.length
                    && jpeg[payload] == 'E' && jpeg[payload + 1] == 'x' && jpeg[payload + 2] == 'i'
                    && jpeg[payload + 3] == 'f' && jpeg[payload + 4] == 0 && jpeg[payload + 5] == 0) {
                return tiffOrientation(jpeg, payload + 6, Math.min(jpeg.length, pos + 2 + length));
            }
            pos += 2 + length;
        }
        return 1;
    }

    private static int tiffOrientation(byte[] data, int tiff, int end) {
        if (tiff + 8 > end) {
            return 1;
        }
        boolean littleEndian = data[tiff] == 'I' && data[tiff + 1] == 'I';
        if (!littleEndian && !(data[tiff] == 'M' && data[tiff + 1] == 'M')) {
            return 1;
        }
        long directory = tiff + unsigned(data, tiff + 4, 4, littleEndian);
        if (directory + 2 > end) {
            return 1;
        }
        long entries = unsigned(data, (int) directory, 2, littleEndian);
        for (long i = 0; i < entries; i++) {
            long entry = directory + 2 + i * 12;
            if (entry + 12 > end) {
                return 1;
            }
            if (unsigned(data, (int) entry, 2, littleEndian) == 0x0112) {
                long value = unsigned(data, (int) entry + 8, 2, littleEndian);
                return value >= 1 && value <= 8 ? (int) value : 1;
            }
        }
        return 1;
    }

    private static long unsigned(byte[] data, int offset, int bytes, boolean littleEndian) {
        long value = 0;
        for (int i = 0; i < bytes; i++) {
            int index = littleEndian ? offset + bytes - 1 - i : offset + i;
            value = (value << 8) | (data[index] & 0xFF);
        }
        return value;
    }

    /** Redraws the pixels the way the EXIF orientation says they are meant to be seen. */
    static BufferedImage upright(BufferedImage image, int orientation) {
        if (orientation <= 1 || orientation > 8) {
            return image;
        }
        int width = image.getWidth();
        int height = image.getHeight();
        AffineTransform transform = new AffineTransform();
        switch (orientation) {
            case 2 -> { transform.scale(-1, 1); transform.translate(-width, 0); }
            case 3 -> { transform.translate(width, height); transform.rotate(Math.PI); }
            case 4 -> { transform.scale(1, -1); transform.translate(0, -height); }
            case 5 -> { transform.rotate(-Math.PI / 2); transform.scale(-1, 1); }
            case 6 -> { transform.translate(height, 0); transform.rotate(Math.PI / 2); }
            case 7 -> { transform.scale(-1, 1); transform.translate(-height, 0); transform.translate(0, width); transform.rotate(3 * Math.PI / 2); }
            default -> { transform.translate(0, width); transform.rotate(3 * Math.PI / 2); }   // 8
        }
        boolean quarterTurn = orientation >= 5;
        BufferedImage turned = new BufferedImage(
                quarterTurn ? height : width,
                quarterTurn ? width : height,
                image.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = turned.createGraphics();
        try {
            g.drawImage(image, transform, null);
        } finally {
            g.dispose();
        }
        return turned;
    }

    /**
     * Drops the EXIF and XMP chunks from a WebP file (RIFF container) without touching the image
     * data, and clears their flags in the VP8X header. Returns the input unchanged when it has no
     * such chunks, and {@code null} when it is not a well-formed WebP container (the caller then
     * stores it as-is). Package-private for unit testing.
     */
    static byte[] stripWebpMetadata(byte[] data) {
        if (data == null || data.length < 12 || !fourcc(data, 0, "RIFF") || !fourcc(data, 8, "WEBP")) {
            return null;
        }
        long riffEnd = le32(data, 4) + 8;
        if (riffEnd > data.length) {
            return null;
        }
        int end = (int) riffEnd;
        ByteArrayOutputStream out = new ByteArrayOutputStream(data.length);
        out.write(data, 0, 12);
        boolean removed = false;
        int pos = 12;
        while (pos + 8 <= end) {
            long size = le32(data, pos + 4);
            long next = pos + 8 + size + (size & 1);
            if (pos + 8 + size > end) {
                return null;
            }
            next = Math.min(next, end); // the final chunk may omit its padding byte
            boolean metadata = fourcc(data, pos, "EXIF") || fourcc(data, pos, "XMP ");
            if (metadata) {
                removed = true;
            } else {
                out.write(data, pos, (int) (next - pos));
            }
            pos = (int) next;
        }
        if (pos != end) {
            return null;
        }
        if (!removed) {
            return data;
        }
        byte[] result = out.toByteArray();
        // VP8X (always the first chunk when present): flags byte right after the chunk header.
        // Bit 3 says "has EXIF", bit 2 "has XMP"; a decoder may reject a file whose flags promise
        // chunks that are gone.
        if (result.length >= 21 && fourcc(result, 12, "VP8X")) {
            result[20] &= (byte) ~(0x08 | 0x04);
        }
        long riffSize = result.length - 8L;
        result[4] = (byte) riffSize;
        result[5] = (byte) (riffSize >>> 8);
        result[6] = (byte) (riffSize >>> 16);
        result[7] = (byte) (riffSize >>> 24);
        return result;
    }

    private static boolean fourcc(byte[] data, int offset, String expected) {
        if (offset + 4 > data.length) return false;
        for (int i = 0; i < 4; i++) {
            if (data[offset + i] != (byte) expected.charAt(i)) return false;
        }
        return true;
    }

    private static long le32(byte[] data, int offset) {
        return (data[offset] & 0xFFL)
                | (data[offset + 1] & 0xFFL) << 8
                | (data[offset + 2] & 0xFFL) << 16
                | (data[offset + 3] & 0xFFL) << 24;
    }

    private String reencodeFormat(String contentType) {
        if (contentType == null) {
            return null;
        }
        return switch (contentType) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            default -> null;
        };
    }

    @Override
    public Resource load(String storedName) {
        try {
            Path file = root.resolve(storedName).normalize();
            if (!file.startsWith(root)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            }

            Resource resource = new UrlResource(file.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        } catch (MalformedURLException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    @Override
    public void delete(String storedName) {
        try {
            Path file = root.resolve(storedName).normalize();
            if (file.startsWith(root)) {
                Files.deleteIfExists(file);
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not delete stored file", e);
        }
    }

    private String cleanOriginalFilename(MultipartFile file) {
        String rawName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace("\\", "/");
        String filename = StringUtils.getFilename(rawName);
        return StringUtils.cleanPath(filename == null ? "" : filename);
    }
}
