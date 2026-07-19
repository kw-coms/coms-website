package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostBookmarkRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVideoRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.CommunityService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end coverage for the main community controller, exercising the refactored service seam
 * (posts, votes, comments) through HTTP with the production JWT-cookie authentication and same-origin
 * write protection. Previously this controller had no dedicated test.
 */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:community-controller-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=build/test-uploads/community-controller"
})
@AutoConfigureMockMvc
@Transactional
class CommunityControllerTest {

    private static final String AUTHOR = "2025123456";
    private static final String ORIGIN = "https://coms.kw.ac.kr";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CommunityService communityService;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private CommunityPostRepository communityPostRepository;

    @Autowired
    private CommunityPostVoteRepository voteRepository;

    @Autowired
    private CommunityPollVoteRepository pollVoteRepository;

    @Autowired
    private CommunityCommentRepository commentRepository;

    @Autowired
    private CommunityPostImageRepository imageRepository;

    @Autowired
    private CommunityPostFileRepository fileRepository;

    @Autowired
    private CommunityPostVideoRepository videoRepository;

    @Autowired
    private CommunityPostBookmarkRepository bookmarkRepository;

    private Cookie authCookie;

    @BeforeEach
    void setUp() {
        bookmarkRepository.deleteAll();
        fileRepository.deleteAll();
        videoRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        voteRepository.deleteAll();
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
        memberRepository.save(member(AUTHOR, "작성자", Member.Role.USER));
        authCookie = new Cookie("token", jwtTokenProvider.generateToken(AUTHOR, 0));
    }

    @Test
    void createsAndListsPost() throws Exception {
        mockMvc.perform(write(post("/api/community/posts"))
                        .content("{\"title\":\"컨트롤러 글\",\"content\":\"본문 내용\",\"category\":\"GENERAL\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("컨트롤러 글"))
                .andExpect(jsonPath("$.authorDisplayName").value("59기 작성자"));

        mockMvc.perform(get("/api/community/posts").cookie(authCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("컨트롤러 글"));
    }

    @Test
    void votesAndComments() throws Exception {
        Long postId = communityService.create(AUTHOR,
                new CommunityPostRequest("투표 대상", "본문", "GENERAL", false), null).id();

        mockMvc.perform(write(post("/api/community/posts/{id}/vote", postId))
                        .content("{\"value\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.myVote").value(1));

        mockMvc.perform(write(post("/api/community/posts/{id}/comments", postId))
                        .content("{\"content\":\"첫 댓글\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.content").value("첫 댓글"))
                .andExpect(jsonPath("$.authorName").value("59기 작성자"));

        mockMvc.perform(get("/api/community/posts/{id}/comments", postId).cookie(authCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].content").value("첫 댓글"));
    }

    @Test
    void getIncrementsViewCountAndReturnsFullContent() throws Exception {
        Long postId = communityService.create(AUTHOR,
                new CommunityPostRequest("상세 글", "상세 본문", "GENERAL", false), null).id();

        mockMvc.perform(get("/api/community/posts/{id}", postId).cookie(authCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("상세 본문"))
                .andExpect(jsonPath("$.viewCount").value(1));
    }

    @Test
    void rejectsUnsafePostContent() throws Exception {
        mockMvc.perform(write(post("/api/community/posts"))
                        .content("{\"title\":\"제목\",\"content\":\"<script>alert(1)</script>\",\"category\":\"GENERAL\"}"))
                .andExpect(status().isBadRequest());
    }

    /** Attaches the auth cookie, a trusted Origin (for the same-origin write filter) and JSON content type. */
    private MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder builder) {
        return builder.cookie(authCookie).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON);
    }

    private static Member member(String studentId, String name, Member.Role role) {
        Member member = new Member();
        member.setStudentId(studentId);
        member.setName(name);
        member.setEmail(studentId + "@kw.ac.kr");
        member.setPassword("encoded");
        member.setRole(role);
        member.setEmailVerified(true);
        return member;
    }
}
