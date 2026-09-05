package com.coms.backend.config;

import com.coms.backend.security.IntegrationHmacFilter;
import com.coms.backend.security.JwtAuthenticationFilter;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.security.OriginValidationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtTokenProvider jwtTokenProvider;

    @Value("${spring.h2.console.enabled:false}")
    private boolean h2ConsoleEnabled;

    @Value("${cors.allowed-origins}")
    private String corsAllowedOrigins;

    public SecurityConfig(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Privilege ladder: 회장(ADMIN) > 부회장(VICE_PRESIDENT) > 임원(OFFICER) > USER.
     * Both authorizeHttpRequests and @PreAuthorize pick this bean up, so a rule
     * written as hasRole("OFFICER") means "OFFICER or higher" — existing
     * hasAnyRole("ADMIN", "OFFICER") rules automatically admit VICE_PRESIDENT.
     * Mirrors Member.Role's ordinal order; keep the two in sync.
     */
    @Bean
    public RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.withDefaultRolePrefix()
                .role("ADMIN").implies("VICE_PRESIDENT")
                .role("VICE_PRESIDENT").implies("OFFICER")
                .role("OFFICER").implies("USER")
                .role("USER").implies("ASSOCIATE")
                .build();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           UserDetailsService userDetailsService,
                                           OriginValidationFilter originValidationFilter,
                                           IntegrationHmacFilter integrationHmacFilter,
                                           com.coms.backend.repository.MemberRepository memberRepository) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll();
                auth.requestMatchers("/error", "/api/auth/signup", "/api/auth/login", "/api/auth/logout", "/api/auth/refresh", "/hello", "/api/server/time",
                        "/api/auth/email-verification/request-signup", "/api/auth/email-verification/confirm-signup",
                        "/api/auth/password-reset/request", "/api/auth/password-reset/confirm").permitAll();
                auth.requestMatchers("/api/integrations/**").hasRole("INTEGRATION");
                auth.requestMatchers(HttpMethod.POST, "/api/recruit/apply", "/api/recruit/status").permitAll();
                auth.requestMatchers(HttpMethod.GET, "/api/site-settings").permitAll();
                // 동아리방 비밀번호: club_room.view 권한 — 실제 판정은 SiteSettingsController 의
                // @perm.has 가 한다. URL 규칙은 "로그인했는가"까지만 본다.
                auth.requestMatchers("/api/club-room").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/maintenance/bootstrap").permitAll();
                auth.requestMatchers("/api/maintenance/**").hasRole("ADMIN");
                // 회장이 조정하는 권한(site_settings.edit / activity.write / project.write)로 열리는
                // 관리 경로 — 로그인 경계만 URL 에 두고, 직급 판정은 컨트롤러의 @perm.has 가 맡는다.
                auth.requestMatchers("/api/admin/site-settings", "/api/admin/club-room", "/api/admin/club-activity-categories/**",
                        "/api/admin/club-project-categories/**", "/api/admin/recurring-schedules/**").authenticated();
                // community.moderate 권한으로 열리는 중재 화면(신고, 삭제 보관함).
                auth.requestMatchers("/api/admin/community/**").authenticated();
                auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.GET, "/api/notices", "/api/notices/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/notices/*/vote").authenticated();
                // notice.write — 컨트롤러의 @perm.has 가 실제 게이트.
                auth.requestMatchers(HttpMethod.POST, "/api/notices").authenticated();
                auth.requestMatchers(HttpMethod.PATCH, "/api/notices/*/pin").authenticated();
                // 작성자 변경은 회장 전용 (커뮤니티 /posts/*/author 규칙과 동일 정책).
                auth.requestMatchers(HttpMethod.PATCH, "/api/notices/*/author").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.PUT, "/api/notices/**").authenticated();
                auth.requestMatchers(HttpMethod.DELETE, "/api/notices/**").authenticated();
                // activity.write — 컨트롤러의 @perm.has 가 실제 게이트.
                auth.requestMatchers(HttpMethod.GET, "/api/club-activities", "/api/club-activities/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-activities/*/vote").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-activities").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-activities/**").authenticated();
                auth.requestMatchers(HttpMethod.PATCH, "/api/club-activities/**").authenticated();
                auth.requestMatchers(HttpMethod.DELETE, "/api/club-activities/**").authenticated();
                auth.requestMatchers(HttpMethod.GET, "/api/club-events", "/api/club-events/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-events/*/entries/*/vote").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-events/*/rsvp").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-events", "/api/club-events/*/entries").authenticated();
                auth.requestMatchers(HttpMethod.PATCH, "/api/club-events/**").authenticated();
                auth.requestMatchers(HttpMethod.DELETE, "/api/club-events/**").authenticated();
                // Club projects showcase is public (the /apps route is public); admin CRUD
                // lives under /api/admin/** and is guarded above.
                auth.requestMatchers(HttpMethod.GET, "/api/club-projects", "/api/club-projects/**").permitAll();
                // project.write — 컨트롤러의 @perm.has 가 실제 게이트.
                auth.requestMatchers(HttpMethod.POST, "/api/club-projects", "/api/club-projects/**").authenticated();
                auth.requestMatchers(HttpMethod.PATCH, "/api/club-projects/**").authenticated();
                auth.requestMatchers(HttpMethod.DELETE, "/api/club-projects/**").authenticated();
                auth.requestMatchers(HttpMethod.GET, "/api/apps", "/api/apps/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/apps", "/api/apps/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.PUT, "/api/apps/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.DELETE, "/api/apps/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.GET, "/api/fonts", "/api/fonts/**").permitAll();
                // 후원자 공개 페이지 — 로그아웃 상태에서도 읽을 수 있어야 한다. 관리 API 는
                // /api/admin/sponsors/** 이라 위쪽 ADMIN 경계에 이미 걸린다. 로고/배너 이미지는
                // authenticated() 로 끝나는 /api/files/** 아래에 두지 않고 여기로 서빙한다.
                auth.requestMatchers(HttpMethod.GET, "/api/sponsors", "/api/sponsors/**").permitAll();
                auth.requestMatchers(HttpMethod.GET, "/api/community/posts/*/share", "/api/community/posts/*/share-data", "/api/community/posts/*/share-image").permitAll();
                auth.requestMatchers(HttpMethod.HEAD, "/api/community/posts/*/share", "/api/community/posts/*/share-data", "/api/community/posts/*/share-image").permitAll();
                auth.requestMatchers("/api/mini-apps/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/files").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/files/*/vote").authenticated();
                // archive.manage — ArchiveController 의 @perm.has 가 실제 게이트. 명시 matcher 는
                // 아래 authenticated() catch-all 보다 앞서 있어야 의도가 드러난다.
                auth.requestMatchers(HttpMethod.DELETE, "/api/files/**").authenticated();
                auth.requestMatchers(HttpMethod.PATCH, "/api/files/**").authenticated();
                auth.requestMatchers("/api/files", "/api/files/**").authenticated();
                // community.moderate — CommunityController 의 @perm.has 가 실제 게이트.
                auth.requestMatchers(HttpMethod.PATCH, "/api/community/posts/*/pin").authenticated();
                // 작성자 변경은 회장 전용.
                auth.requestMatchers(HttpMethod.PATCH, "/api/community/posts/*/author").hasRole("ADMIN");
                auth.requestMatchers("/api/community/**").authenticated();
                // Actuator: health and info public, everything else requires ADMIN
                auth.requestMatchers("/actuator/health", "/actuator/info").permitAll();
                auth.requestMatchers("/actuator/**").hasRole("ADMIN");
                // H2 console only when dev-enabled
                if (h2ConsoleEnabled) {
                    auth.requestMatchers("/h2-console/**").permitAll();
                }
                auth.anyRequest().authenticated();
            })
            .headers(headers -> headers
                .frameOptions(frame -> {
                    if (h2ConsoleEnabled) {
                        frame.sameOrigin();
                    } else {
                        frame.deny();
                    }
                })
                .contentTypeOptions(ct -> {})
                .xssProtection(xss -> {})
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                    "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; " +
                    "font-src 'self'; " +
                    "connect-src 'self'; " +
                    "object-src 'none'; " +
                    "base-uri 'self'; " +
                    "form-action 'self'; " +
                    "frame-ancestors 'none';"
                ))
            )
            .addFilterBefore(originValidationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(integrationHmacFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(
                new JwtAuthenticationFilter(jwtTokenProvider, userDetailsService, memberRepository),
                UsernamePasswordAuthenticationFilter.class
            );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        List<String> allowedOrigins = Arrays.stream(corsAllowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
        if (allowedOrigins.isEmpty()) {
            throw new IllegalStateException("cors.allowed-origins must be configured");
        }
        if (allowedOrigins.contains("*")) {
            throw new IllegalStateException("CORS '*' is incompatible with allowCredentials=true");
        }
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With", "X-Bootstrap-Secret"));
        // Expose the pagination total so cross-origin clients can read it from the optional ?page/?size slices.
        config.setExposedHeaders(List.of("X-Total-Count"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
