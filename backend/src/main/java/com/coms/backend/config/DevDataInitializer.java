package com.coms.backend.config;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
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

    public DevDataInitializer(MemberRepository memberRepository, PasswordEncoder passwordEncoder) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (memberRepository.existsByStudentId("admin")) return;

        Member admin = new Member();
        admin.setStudentId("admin");
        admin.setName("COM's 관리자");
        admin.setEmail("admin@coms.kw.ac.kr");
        admin.setPassword(passwordEncoder.encode("admin1234"));
        admin.setRole(Member.Role.ADMIN);
        memberRepository.save(admin);
    }
}
