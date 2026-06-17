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
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
public class LocalStorageService implements StorageService {

    private final Path root;

    public LocalStorageService(@Value("${storage.location:./uploads}") String location) {
        this.root = Paths.get(location).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize storage directory", e);
        }
    }

    @Override
    public String store(MultipartFile file) throws IOException {
        String originalName = cleanOriginalFilename(file);
        if (file.isEmpty() || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty or missing a filename.");
        }

        String stored = UUID.randomUUID() + "_" + originalName;
        Path destination = root.resolve(stored).normalize();
        if (!destination.startsWith(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid filename.");
        }

        Files.copy(file.getInputStream(), destination);
        return stored;
    }

    @Override
    public String storeImage(MultipartFile file, String contentType) throws IOException {
        String originalName = cleanOriginalFilename(file);
        if (file.isEmpty() || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty or missing a filename.");
        }

        byte[] sanitized = stripImageMetadata(file, contentType);
        if (sanitized == null) {
            // Format cannot be safely re-encoded (e.g. animated GIF, WebP) — store the raw bytes.
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
     * (EXIF GPS coordinates, camera/device identifiers, timestamps). Returns {@code null} for
     * formats ImageIO cannot losslessly re-write so the caller can fall back to a raw copy.
     */
    private byte[] stripImageMetadata(MultipartFile file, String contentType) throws IOException {
        String format = reencodeFormat(contentType);
        if (format == null) {
            return null;
        }
        BufferedImage image;
        try (InputStream in = file.getInputStream()) {
            image = ImageIO.read(in);
        }
        if (image == null) {
            return null;
        }
        BufferedImage target = image;
        if ("jpg".equals(format) && image.getColorModel().hasAlpha()) {
            // JPEG has no alpha channel; flatten onto white to avoid a corrupt write.
            target = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = target.createGraphics();
            g.drawImage(image, 0, 0, Color.WHITE, null);
            g.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!ImageIO.write(target, format, out)) {
            return null;
        }
        return out.toByteArray();
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
