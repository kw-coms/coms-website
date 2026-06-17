package com.coms.backend.service;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface StorageService {
    String store(MultipartFile file) throws IOException;

    /**
     * Store an image, stripping embedded metadata (EXIF GPS, camera/device tags, etc.) for the
     * formats that can be safely re-encoded — currently JPEG and PNG, which are decoded and
     * re-written so no metadata survives. Formats with no safe re-encoder (GIF, WebP) fall back to
     * a raw {@link #store} copy and retain their original metadata; restrict uploads to JPEG/PNG at
     * the API layer if the stripping guarantee is required for every accepted format.
     */
    String storeImage(MultipartFile file, String contentType) throws IOException;

    Resource load(String storedName);
    void delete(String storedName);
}
