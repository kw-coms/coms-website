package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class CommunityServiceTest {
    @Autowired
    private CommunityService communityService;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private CommunityPostRepository communityPostRepository;

    @BeforeEach
    void setUp() {
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void derivesGenerationDisplayNameFromStudentId() {
        assertThat(CommunityService.generationFromStudentId("2026123456")).isEqualTo("60기");
        assertThat(CommunityService.generationFromStudentId("2025123456")).isEqualTo("59기");
        assertThat(CommunityService.generationFromStudentId("2024123456")).isEqualTo("58기");
        assertThat(CommunityService.displayName("2026123456", "관리자")).isEqualTo("60기관리자");
    }

    @Test
    void listsAuthorDisplayNameAndAdminMarker() {
        Member admin = member("2026123456", "관리자", Member.Role.ADMIN);
        Member user = member("2025123456", "회원", Member.Role.USER);
        memberRepository.save(admin);
        memberRepository.save(user);

        communityService.create(admin.getStudentId(), new CommunityPostRequest("공지", "관리자 글"));
        CommunityPost post = new CommunityPost();
        post.setTitle("질문");
        post.setContent("일반 회원 글");
        post.setAuthorStudentId(user.getStudentId());
        post.setAuthorName(user.getName());
        communityPostRepository.save(post);

        var posts = communityService.list(user.getStudentId());

        assertThat(posts)
                .extracting("authorDisplayName")
                .contains("60기관리자", "59기회원");
        assertThat(posts)
                .filteredOn(postResponse -> postResponse.authorDisplayName().equals("60기관리자"))
                .singleElement()
                .satisfies(postResponse -> assertThat(postResponse.authorAdmin()).isTrue());
    }

    private Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@example.com");
        member.setPassword("encoded-password");
        member.setRole(role);
        return member;
    }
}
