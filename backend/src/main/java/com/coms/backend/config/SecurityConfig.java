package com.coms.backend.config;

import com.coms.backend.security.IntegrationHmacFilter;
import com.coms.backend.security.JwtAuthenticationFilter;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.security.OriginValidationFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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

    @Value("${cors.allowed-origins:http://localhost:5173}")
    private String corsAllowedOrigins;

    public SecurityConfig(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           UserDetailsService userDetailsService,
                                           OriginValidationFilter originValidationFilter,
                                           IntegrationHmacFilter integrationHmacFilter) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers("/error", "/api/auth/signup", "/api/auth/login", "/api/auth/logout", "/api/auth/refresh", "/hello", "/api/server/time",
                        "/api/auth/email-verification/request-signup", "/api/auth/email-verification/confirm-signup",
                        "/api/auth/password-reset/request", "/api/auth/password-reset/confirm").permitAll();
                auth.requestMatchers("/api/integrations/**").hasRole("INTEGRATION");
                auth.requestMatchers(HttpMethod.POST, "/api/recruit/apply").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/maintenance/bootstrap").permitAll();
                auth.requestMatchers("/api/maintenance/**").hasRole("ADMIN");
                auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.GET, "/api/notices", "/api/notices/**").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/notices").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.PUT, "/api/notices/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.DELETE, "/api/notices/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.GET, "/api/club-activities", "/api/club-activities/**").authenticated();
                auth.requestMatchers(HttpMethod.POST, "/api/club-activities").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.DELETE, "/api/club-activities/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.GET, "/api/fonts", "/api/fonts/**").permitAll();
                auth.requestMatchers(HttpMethod.GET, "/api/community/posts/*/share", "/api/community/posts/*/share-data", "/api/community/posts/*/share-image").permitAll();
                auth.requestMatchers(HttpMethod.HEAD, "/api/community/posts/*/share", "/api/community/posts/*/share-data", "/api/community/posts/*/share-image").permitAll();
                auth.requestMatchers(HttpMethod.GET, "/api/mini-apps/*/shared", "/api/mini-apps/*/shared/*").permitAll();
                auth.requestMatchers(HttpMethod.HEAD, "/api/mini-apps/*/shared", "/api/mini-apps/*/shared/*").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/files").authenticated();
                auth.requestMatchers(HttpMethod.DELETE, "/api/files/**").hasRole("ADMIN");
                auth.requestMatchers("/api/files", "/api/files/**").authenticated();
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
                new JwtAuthenticationFilter(jwtTokenProvider, userDetailsService),
                UsernamePasswordAuthenticationFilter.class
            );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
	config.setAllowedOrigins(
		Arrays.stream(corsAllowedOrigins.split(","))
			.map(String::trim)
			.filter(origin -> !origin.isEmpty())
			.toList()
	);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With", "X-Bootstrap-Secret"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
