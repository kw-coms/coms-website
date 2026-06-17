package com.coms.backend.service;

import com.coms.backend.domain.CommunityPost;
import com.coms.backend.dto.CommunityPostReportRequest;
import com.coms.backend.repository.CommunityPostReportRepository;
import com.coms.backend.repository.CommunityPostRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-report-service-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
@Transactional
class CommunityPostReportServiceTest {
    @Autowired
    private CommunityPostReportService reportService;

    @Autowired
    private CommunityPostRepository postRepository;

    @Autowired
    private CommunityPostReportRepository reportRepository;

    @BeforeEach
    void clean() {
        reportRepository.deleteAll();
        postRepository.deleteAll();
    }

    @Test
    void listOpenIncludesReportedPostTitle() {
        CommunityPost post = new CommunityPost();
        post.setTitle("신고 대상 글");
        post.setContent("본문");
        post.setAuthorStudentId("2025123456");
        post.setAuthorName("작성자");
        CommunityPost saved = postRepository.save(post);

        reportService.report(saved.getId(), "2026123456", new CommunityPostReportRequest("SPAM", "홍보"));

        assertThat(reportService.listOpen())
                .singleElement()
                .satisfies(report -> {
                    assertThat(report.postId()).isEqualTo(saved.getId());
                    assertThat(report.postTitle()).isEqualTo("신고 대상 글");
                });
    }
}
