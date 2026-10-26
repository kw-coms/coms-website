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
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.security.ShareLinkSigner;
import com.coms.backend.service.CommunityService;
import jakarta.servlet.http.Cookie;
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
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
    private ShareLinkSigner shareLinkSigner;

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
    void signedShareLinkGetsThePostsOpenGraphCardWithoutLogin() throws Exception {
        var post = postWithImage("사진 있는 글", "<b>사진이 있는 글입니다.</b>");
        String signature = shareLinkSigner.sign(post.id());

        mockMvc.perform(get("/api/community/posts/{id}/share", post.id())
                        .param("s", signature)
                        .secure(true)
                        .header("Host", "coms.kw.ac.kr"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("property=\"og:type\" content=\"article\"")))
                .andExpect(content().string(containsString("property=\"og:title\" content=\"사진 있는 글\"")))
                .andExpect(content().string(containsString("property=\"og:description\" content=\"여기를 눌러 내용을 확인하세요.\ncoms.kw.ac.kr\"")))
                .andExpect(content().string(not(containsString("사진이 있는 글입니다."))))
                .andExpect(content().string(containsString("property=\"og:url\" content=\"https://coms.kw.ac.kr/community/" + post.id() + "?s=" + signature + "\"")))
                .andExpect(content().string(containsString("property=\"og:image\" content=\"https://coms.kw.ac.kr/api/community/posts/" + post.id() + "/share-image?s=" + signature + "\"")))
                .andExpect(content().string(containsString("name=\"twitter:card\" content=\"summary_large_image\"")));
    }

    @Test
    void unsignedOrForgedShareRequestsGetTheSameGenericCard() throws Exception {
        var post = postWithImage("회원만 보는 제목", "내용");
        long missingId = post.id() + 1000;

        for (String path : new String[]{"/api/community/posts/" + post.id() + "/share",
                "/api/community/posts/" + post.id() + "/share?s=" + shareLinkSigner.sign(missingId),
                "/api/community/posts/" + missingId + "/share"}) {
            mockMvc.perform(get(path).secure(true).header("Host", "coms.kw.ac.kr"))
                    .andExpect(status().isOk())
                    .andExpect(content().string(containsString("property=\"og:type\" content=\"website\"")))
                    .andExpect(content().string(containsString("커뮤니티")))
                    .andExpect(content().string(containsString("https://coms.kw.ac.kr/og-image.jpg")))
                    .andExpect(content().string(not(containsString("회원만 보는 제목"))))
                    .andExpect(content().string(not(containsString("share-image"))));
        }
    }

    @Test
    void shareImageNeedsAValidSignature() throws Exception {
        var post = postWithImage("사진 있는 글", "내용");

        mockMvc.perform(get("/api/community/posts/{id}/share-image", post.id()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/community/posts/{id}/share-image", post.id()).param("s", "x".repeat(22)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/community/posts/{id}/share-image", post.id())
                        .param("s", shareLinkSigner.sign(post.id())))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("inline")))
                .andExpect(header().string("Cache-Control", containsString("private")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(PREVIEW_PNG));
    }

    @Test
    void exposesCommunityShareImageHeadersWithoutLogin() throws Exception {
        var post = postWithImage("사진 있는 글", "내용");

        mockMvc.perform(head("/api/community/posts/{id}/share-image", post.id())
                        .param("s", shareLinkSigner.sign(post.id())))
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
        var post = postWithImage("공유용 제목", "공개 미리보기 설명");
        String signature = shareLinkSigner.sign(post.id());

        mockMvc.perform(get("/api/community/posts/{id}/share-data", post.id())
                        .param("s", signature)
                        .secure(true)
                        .header("Host", "coms.kw.ac.kr"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string(containsString("\"id\":" + post.id())))
                .andExpect(content().string(containsString("\"title\":\"공유용 제목\"")))
                .andExpect(content().string(containsString("\"description\":\"여기를 눌러 내용을 확인하세요.\\ncoms.kw.ac.kr\"")))
                .andExpect(content().string(not(containsString("공개 미리보기 설명"))))
                .andExpect(content().string(containsString("\"url\":\"https://coms.kw.ac.kr/community/" + post.id() + "?s=" + signature + "\"")))
                .andExpect(content().string(containsString("\"imageUrl\":\"https://coms.kw.ac.kr/api/community/posts/" + post.id() + "/share-image?s=" + signature + "\"")))
                .andExpect(content().string(not(containsString("authorStudentId"))))
                .andExpect(content().string(not(containsString("authorName"))))
                .andExpect(content().string(not(containsString("작성자"))))
                .andExpect(content().string(not(containsString("2025123456"))))
                .andExpect(content().string(not(containsString("email"))))
                .andExpect(content().string(not(containsString("ipAddress"))))
                .andExpect(content().string(not(containsString("content"))))
                .andExpect(content().string(not(containsString("editable"))))
                .andExpect(content().string(not(containsString("fileInfos"))));

        mockMvc.perform(get("/api/community/posts/{id}/share-data", post.id()))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("공유용 제목"))))
                .andExpect(jsonPath("$.hasImage").value(false))
                .andExpect(jsonPath("$.imageUrl").doesNotExist());
    }

    @Test
    void shareLinkIsSignedForMembersWhoCanReadThePost() throws Exception {
        var post = postWithImage("공유할 글", "내용");
        memberRepository.save(member("2025000001", "다른 부원", Member.Role.USER));

        mockMvc.perform(get("/api/community/posts/{id}/share-link", post.id()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/community/posts/{id}/share-link", post.id())
                        .cookie(token("2025000001"))
                        .secure(true)
                        .header("Host", "coms.kw.ac.kr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signature").value(shareLinkSigner.sign(post.id())))
                .andExpect(jsonPath("$.url").value("https://coms.kw.ac.kr/community/" + post.id()
                        + "?s=" + shareLinkSigner.sign(post.id())));
    }

    @Test
    void anonymousBoardPostsGetNoShareLink() throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        var post = communityService.create(
                author.getStudentId(),
                new CommunityPostRequest("익명 글", "내용", "ANONYMOUS", false),
                null
        );

        mockMvc.perform(get("/api/community/posts/{id}/share-link", post.id()).cookie(token(author.getStudentId())))
                .andExpect(status().isNotFound());
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
                .andExpect(status().isUnauthorized());
    }

    private com.coms.backend.dto.CommunityPostResponse postWithImage(String title, String content) throws Exception {
        Member author = member("2025123456", "작성자", Member.Role.USER);
        memberRepository.save(author);
        MockMultipartFile image = new MockMultipartFile("image", "preview.png", "image/png", PREVIEW_PNG);
        return communityService.create(
                author.getStudentId(),
                new CommunityPostRequest(title, content, "GENERAL", false),
                image
        );
    }

    private Cookie token(String studentId) {
        return new Cookie("token", jwtTokenProvider.generateToken(studentId, 0));
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
