package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CacheMaintenanceServiceTest {
    @Test
    void clearAllClearsEveryKnownSpringCache() {
        ConcurrentMapCacheManager cacheManager = new ConcurrentMapCacheManager("fonts", "community");
        cacheManager.getCache("fonts").put("active", "cached-fonts");
        cacheManager.getCache("community").put("posts", "cached-posts");

        CacheMaintenanceService service = new CacheMaintenanceService(List.of(cacheManager));

        var response = service.clearAll();

        assertThat(response.clearedCount()).isEqualTo(2);
        assertThat(response.clearedCaches()).containsExactly("community", "fonts");
        assertThat(cacheManager.getCache("fonts").get("active")).isNull();
        assertThat(cacheManager.getCache("community").get("posts")).isNull();
    }

    @Test
    void clearAllReportsZeroWhenNoCacheManagerExists() {
        CacheMaintenanceService service = new CacheMaintenanceService(List.of());

        var response = service.clearAll();

        assertThat(response.clearedCount()).isZero();
        assertThat(response.clearedCaches()).isEmpty();
        assertThat(response.clearedAt()).isNotNull();
    }
}
