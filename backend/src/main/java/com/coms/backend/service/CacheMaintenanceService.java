package com.coms.backend.service;

import com.coms.backend.dto.CacheClearResponse;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CacheMaintenanceService {
    private final List<CacheManager> cacheManagers;

    public CacheMaintenanceService(List<CacheManager> cacheManagers) {
        this.cacheManagers = cacheManagers;
    }

    public CacheClearResponse clearAll() {
        List<String> clearedCaches = cacheManagers.stream()
                .flatMap(cacheManager -> cacheManager.getCacheNames().stream()
                        .sorted()
                        .filter(cacheName -> clearCache(cacheManager, cacheName)))
                .sorted()
                .toList();

        return new CacheClearResponse(clearedCaches, clearedCaches.size(), LocalDateTime.now());
    }

    private boolean clearCache(CacheManager cacheManager, String cacheName) {
        var cache = cacheManager.getCache(cacheName);
        if (cache == null) {
            return false;
        }
        cache.clear();
        return true;
    }
}
