package com.coms.backend.config;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
public class DevDataInitializer implements ApplicationRunner {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminPassword;

    public DevDataInitializer(MemberRepository memberRepository, PasswordEncoder passwordEncoder,
                              @Value("${coms.dev.admin-password:}") String adminPassword) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminPassword == null || adminPassword.isBlank()) return;
        if (adminPassword.length() < 12) {
            throw new IllegalStateException("COMS_DEV_ADMIN_PASSWORD must be at least 12 characters");
        }
        if (memberRepository.existsByStudentId("admin")) return;

        Member admin = new Member();
        admin.setStudentId("admin");
        admin.setName("COM's 관리자");
        admin.setEmail("admin@coms.kw.ac.kr");
        admin.setPassword(passwordEncoder.encode(adminPassword));
        admin.setRole(Member.Role.ADMIN);
        memberRepository.save(admin);
    }
}
