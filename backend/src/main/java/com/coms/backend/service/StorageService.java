package com.coms.backend.service;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface StorageService {
    String store(MultipartFile file) throws IOException;
    Resource load(String storedName);
    void delete(String storedName);
}
