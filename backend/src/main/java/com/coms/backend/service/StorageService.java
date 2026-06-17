package com.coms.backend.service;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface StorageService {
    String store(MultipartFile file) throws IOException;

    /**
     * Store an image with all embedded metadata (EXIF GPS, camera/device tags, etc.) stripped.
     * Re-encodable raster formats are decoded and re-written so no metadata survives; formats that
     * cannot be safely re-encoded fall back to a raw {@link #store} copy.
     */
    String storeImage(MultipartFile file, String contentType) throws IOException;

    Resource load(String storedName);
    void delete(String storedName);
}
