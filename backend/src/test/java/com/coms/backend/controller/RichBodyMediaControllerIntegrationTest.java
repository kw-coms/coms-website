package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.security.JwtTokenProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Exercises URL and method permission checks together with upload validation. */
@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:rich-media-security-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/rich-media-security"
})
@AutoConfigureMockMvc
@Transactional
class RichBodyMediaControllerIntegrationTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final byte[] PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
            (byte) 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9C, 0x63, (byte) 0xF8,
            (byte) 0xCF, (byte) 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, (byte) 0xC9, (byte) 0xFE, (byte) 0x92,
            (byte) 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82};

    @Autowired MockMvc mvc;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider jwt;
    @Autowired com.coms.backend.repository.RichBodyMediaRepository media;

    private Cookie member;
    private Cookie officer;
    private Cookie admin;

    @BeforeEach
    void setUp() {
        members.save(member("2026000101", Member.Role.USER));
        members.save(member("2026000102", Member.Role.OFFICER));
        members.save(member("2026000103", Member.Role.ADMIN));
        member = cookie("2026000101");
        officer = cookie("2026000102");
        admin = cookie("2026000103");
    }

    @Test void anonymousUploadNeedsLogin() throws Exception {
        for (String scope : new String[]{"notice", "archive", "sponsor"}) {
            mvc.perform(multipart("/api/rich-media/" + scope + "/images").file(png()).header("Origin", ORIGIN))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test void noticeUploadRequiresNoticeWrite() throws Exception {
        mvc.perform(multipart("/api/rich-media/notice/images").file(png()).cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(multipart("/api/rich-media/notice/images").file(png()).cookie(officer).header("Origin", ORIGIN))
                .andExpect(status().isOk());
        mvc.perform(multipart("/api/rich-media/notice/images").file(png()).cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isOk());
    }

    @Test void archiveUploadAllowsAuthenticatedMember() throws Exception {
        mvc.perform(multipart("/api/rich-media/archive/images").file(png()).cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.kind").value("IMAGE"));
    }

    @Test void sponsorUploadRequiresAdmin() throws Exception {
        mvc.perform(multipart("/api/rich-media/sponsor/images").file(png()).cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(multipart("/api/rich-media/sponsor/images").file(png()).cookie(officer).header("Origin", ORIGIN))
                .andExpect(status().isForbidden());
        mvc.perform(multipart("/api/rich-media/sponsor/images").file(png()).cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isOk());
    }

    @Test void unknownScopeIsRejected() throws Exception {
        mvc.perform(multipart("/api/rich-media/unknown/images").file(png()).cookie(admin).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test void declaredImageTypeMustMatchBytes() throws Exception {
        MockMultipartFile disguised = new MockMultipartFile("image", "fake.png", "image/png", "<script>x</script>".getBytes());
        mvc.perform(multipart("/api/rich-media/archive/images").file(disguised).cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test void imageOverFiveMegabytesIsRejected() throws Exception {
        byte[] oversized = new byte[5 * 1024 * 1024 + 1];
        System.arraycopy(PNG, 0, oversized, 0, PNG.length);
        mvc.perform(multipart("/api/rich-media/archive/images")
                        .file(new MockMultipartFile("image", "large.png", "image/png", oversized))
                        .cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test void zipFileMustHaveZipSignature() throws Exception {
        MockMultipartFile disguised = new MockMultipartFile("file", "fake.zip", "application/zip", "plain text".getBytes());
        mvc.perform(multipart("/api/rich-media/archive/files").file(disguised).cookie(member).header("Origin", ORIGIN))
                .andExpect(status().isBadRequest());
    }

    @Test void officeAndPdfExtensionAllowlistIncludesPdf() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile("file", "notice.pdf", "application/pdf", "%PDF-1.4\n".getBytes());
        mvc.perform(multipart("/api/rich-media/notice/files").file(pdf).cookie(officer).header("Origin", ORIGIN))
                .andExpect(status().isOk());
    }

    @Test void attachedSponsorMediaIsPublicWhileAttachedNoticeMediaNeedsLogin() throws Exception {
        long sponsorId = uploadId("sponsor", admin);
        long noticeId = uploadId("notice", officer);
        media.findById(sponsorId).orElseThrow().attach(1L, java.time.LocalDateTime.now());
        media.findById(noticeId).orElseThrow().attach(2L, java.time.LocalDateTime.now());
        mvc.perform(get("/api/rich-media/{id}", sponsorId)).andExpect(status().isOk());
        mvc.perform(get("/api/rich-media/{id}", noticeId)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/rich-media/{id}", noticeId).cookie(member)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("private")));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"notice", "archive", "sponsor"})
    void pendingMediaIsOnlyReadableByUploaderOrAdmin(String scope) throws Exception {
        Cookie uploader = scope.equals("sponsor") ? admin : officer;
        long id = uploadId(scope, uploader);
        for (String suffix : new String[]{"", "/download"}) {
            String url = "/api/rich-media/" + id + suffix;
            mvc.perform(get(url).cookie(uploader)).andExpect(status().isOk());
            mvc.perform(get(url).cookie(admin)).andExpect(status().isOk());
            mvc.perform(get(url).cookie(member)).andExpect(status().isNotFound());
            mvc.perform(get(url)).andExpect(status().isNotFound());
        }
    }

    @Test void detachedMediaIsPrivateAgain() throws Exception {
        long id = uploadId("archive", officer);
        var row = media.findById(id).orElseThrow();
        row.attach(2L, java.time.LocalDateTime.now());
        mvc.perform(get("/api/rich-media/{id}", id).cookie(member)).andExpect(status().isOk());
        row.detach();
        mvc.perform(get("/api/rich-media/{id}", id).cookie(member)).andExpect(status().isNotFound());
        mvc.perform(get("/api/rich-media/{id}", id).cookie(officer)).andExpect(status().isOk());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"notice", "archive", "sponsor"})
    void pendingMediaWithDeletedUploaderIsAdminOnly(String scope) throws Exception {
        long id = uploadId(scope, admin);
        org.springframework.test.util.ReflectionTestUtils.setField(media.findById(id).orElseThrow(), "uploaderId", null);
        media.flush();
        mvc.perform(get("/api/rich-media/{id}", id).cookie(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/rich-media/{id}", id).cookie(member)).andExpect(status().isNotFound());
        mvc.perform(get("/api/rich-media/{id}", id)).andExpect(status().isNotFound());
    }

    @Test void explicitDownloadIsAttachmentAndCannotBeSniffed() throws Exception {
        long id = uploadId("archive", member);
        mvc.perform(get("/api/rich-media/{id}/download", id).cookie(member))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment;")));
    }

    private long uploadId(String scope, Cookie cookie) throws Exception {
        MvcResult result = mvc.perform(multipart("/api/rich-media/{scope}/images", scope)
                .file(png()).cookie(cookie).header("Origin", ORIGIN)).andExpect(status().isOk()).andReturn();
        return new com.fasterxml.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsString()).get("id").asLong();
    }

    private MockMultipartFile png() { return new MockMultipartFile("image", "photo.png", "image/png", PNG); }
    private Cookie cookie(String studentId) { return new Cookie("token", jwt.generateToken(studentId, 0)); }
    private Member member(String studentId, Member.Role role) {
        Member result = new Member();
        result.setStudentId(studentId);
        result.setName(role.name());
        result.setEmail(studentId + "@example.com");
        result.setPassword("unused");
        result.setRole(role);
        result.setEmailVerified(true);
        return result;
    }
}
