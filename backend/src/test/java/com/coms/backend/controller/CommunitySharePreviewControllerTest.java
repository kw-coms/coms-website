package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.dto.CommunityPostRequest;
import com.coms.backend.repository.CommunityCommentRepository;
import com.coms.backend.repository.CommunityPollVoteRepository;
import com.coms.backend.repository.CommunityPostFileRepository;
import com.coms.backend.repository.CommunityPostImageRepository;
import com.coms.backend.repository.CommunityPostRepository;
import com.coms.backend.repository.CommunityPostVoteRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.service.CommunityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:community-share-preview-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=build/test-uploads/community-share-preview"
})
@AutoConfigureMockMvc
@Transactional
class CommunitySharePreviewControllerTest {

    // 업로드 검증이 실제 PNG 바이트를 요구한다.
    private static final byte[] PREVIEW_PNG = onePixelPng();

    private static byte[] onePixelPng() {
        try {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(
                    new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_RGB),
                    "png", out);
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CommunityService communityService;

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

    @BeforeEach
    void setUp() {
        fileRepository.deleteAll();
        imageRepository.deleteAll();
        commentRepository.deleteAll();
        pollVoteRepository.deleteAll();
        voteRepository.deleteAll();
        communityPostRepository.deleteAll();
        memberRepository.deleteAll();
    }

    @Test
    void exposesOpenGraphHtmlForCommunityPostWithoutLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        MockMultipartFile image = new MockMultipartFile("image", "preview.png", "image/png", PREVIEW_PNG);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사진 있는 글", "<b>사진이 있는 글입니다.</b>", "GENERAL", false),
                image
        );

        mockMvc.perform(get("/api/community/posts/{id}/share", post.id())
                        .secure(true)
                        .header("Host", "coms.kw.ac.kr"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("property=\"og:type\" content=\"article\"")))
                .andExpect(content().string(containsString("property=\"og:title\" content=\"사진 있는 글\"")))
                .andExpect(content().string(containsString("property=\"og:description\" content=\"여기를 눌러 내용을 확인하세요.\ncoms.kw.ac.kr\"")))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("사진이 있는 글입니다."))))
                .andExpect(content().string(containsString("property=\"og:url\" content=\"https://coms.kw.ac.kr/community/" + post.id() + "\"")))
                .andExpect(content().string(containsString("property=\"og:image\" content=\"https://coms.kw.ac.kr/api/community/posts/" + post.id() + "/share-image\"")))
                .andExpect(content().string(containsString("name=\"twitter:card\" content=\"summary_large_image\"")));
    }

    @Test
    void exposesCommunityShareImageWithoutLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        MockMultipartFile image = new MockMultipartFile("image", "preview.png", "image/png", PREVIEW_PNG);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사진 있는 글", "내용", "GENERAL", false),
                image
        );

        mockMvc.perform(get("/api/community/posts/{id}/share-image", post.id()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("inline")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(PREVIEW_PNG));
    }

    @Test
    void exposesCommunityShareImageHeadersWithoutLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        MockMultipartFile image = new MockMultipartFile("image", "preview.png", "image/png", PREVIEW_PNG);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("사진 있는 글", "내용", "GENERAL", false),
                image
        );

        mockMvc.perform(head("/api/community/posts/{id}/share-image", post.id()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("inline")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_PNG));
    }

    @Test
    void exposesCommunityShareHtmlHeadersWithoutLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("공유 헤더", "내용", "GENERAL", false),
                null
        );

        mockMvc.perform(head("/api/community/posts/{id}/share", post.id()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
    }

    @Test
    void exposesOnlySafeShareDataWithoutLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        MockMultipartFile image = new MockMultipartFile("image", "preview.png", "image/png", PREVIEW_PNG);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("공유용 제목", "공개 미리보기 설명", "GENERAL", false),
                image
        );

        mockMvc.perform(get("/api/community/posts/{id}/share-data", post.id())
                        .secure(true)
                        .header("Host", "coms.kw.ac.kr"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string(containsString("\"id\":" + post.id())))
                .andExpect(content().string(containsString("\"title\":\"공유용 제목\"")))
                .andExpect(content().string(containsString("\"description\":\"여기를 눌러 내용을 확인하세요.\\ncoms.kw.ac.kr\"")))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("공개 미리보기 설명"))))
                .andExpect(content().string(containsString("\"url\":\"https://coms.kw.ac.kr/community/" + post.id() + "\"")))
                .andExpect(content().string(containsString("\"imageUrl\":\"https://coms.kw.ac.kr/api/community/posts/" + post.id() + "/share-image\"")))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("authorStudentId"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("authorName"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("작성자"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("2025123456"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("email"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("ipAddress"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("content"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("editable"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("fileInfos"))));
    }

    @Test
    void fullCommunityDetailStillRequiresLogin() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("비공개 상세", "로그인해야 볼 수 있는 전체 본문", "GENERAL", false),
                null
        );

        mockMvc.perform(get("/api/community/posts/{id}", post.id()))
                .andExpect(status().isForbidden());
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
