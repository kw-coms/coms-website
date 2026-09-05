package com.coms.backend.service;

import com.coms.backend.dto.CacheClearResponse;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;

@Service
public class CacheMaintenanceService {
    // PermissionService's role-permission matrix isn't backed by a Spring CacheManager, so it
    // can't be discovered via cacheManager.getCacheNames() — it's reported here by a fixed name.
    private static final String ROLE_PERMISSIONS_CACHE_NAME = "role-permissions";

    private final List<CacheManager> cacheManagers;
    private final PermissionService permissionService;

    public CacheMaintenanceService(List<CacheManager> cacheManagers, PermissionService permissionService) {
        this.cacheManagers = cacheManagers;
        this.permissionService = permissionService;
    }

    public CacheClearResponse clearAll() {
        permissionService.invalidate();
        List<String> clearedCaches = Stream.concat(
                        Stream.of(ROLE_PERMISSIONS_CACHE_NAME),
                        cacheManagers.stream()
                                .flatMap(cacheManager -> cacheManager.getCacheNames().stream()
                                        .sorted()
                                        .filter(cacheName -> clearCache(cacheManager, cacheName))))
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
