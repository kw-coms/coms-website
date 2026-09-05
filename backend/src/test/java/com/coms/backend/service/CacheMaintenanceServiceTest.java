package com.coms.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CacheMaintenanceServiceTest {
    @Test
    void clearAllClearsEveryKnownSpringCache() {
        ConcurrentMapCacheManager cacheManager = new ConcurrentMapCacheManager("fonts", "community");
        cacheManager.getCache("fonts").put("active", "cached-fonts");
        cacheManager.getCache("community").put("posts", "cached-posts");
        PermissionService permissionService = mock(PermissionService.class);

        CacheMaintenanceService service = new CacheMaintenanceService(List.of(cacheManager), permissionService);

        var response = service.clearAll();

        assertThat(response.clearedCount()).isEqualTo(3);
        assertThat(response.clearedCaches()).containsExactly("community", "fonts", "role-permissions");
        assertThat(cacheManager.getCache("fonts").get("active")).isNull();
        assertThat(cacheManager.getCache("community").get("posts")).isNull();
        verify(permissionService).invalidate();
    }

    @Test
    void clearAllReportsOnlyRolePermissionsWhenNoCacheManagerExists() {
        PermissionService permissionService = mock(PermissionService.class);
        CacheMaintenanceService service = new CacheMaintenanceService(List.of(), permissionService);

        var response = service.clearAll();

        assertThat(response.clearedCount()).isEqualTo(1);
        assertThat(response.clearedCaches()).containsExactly("role-permissions");
        assertThat(response.clearedAt()).isNotNull();
        verify(permissionService).invalidate();
    }
}
