package com.coms.backend.controller;

import com.coms.backend.domain.Member;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.ClubProjectCommentRepository;
import com.coms.backend.repository.ClubProjectLikeRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.ClubProjectService;
import com.coms.backend.service.ClubProjectSocialService;
import com.coms.backend.service.AdminService;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "cors.allowed-origins=https://coms.kw.ac.kr",
        "spring.datasource.url=jdbc:h2:mem:club-project-social-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/club-project-social"
})
@AutoConfigureMockMvc
class ClubProjectSocialEndpointTest {
    private static final String ORIGIN = "https://coms.kw.ac.kr";
    @Autowired MockMvc mvc;
    @Autowired ClubProjectService projects;
    @Autowired MemberRepository members;
    @Autowired JwtTokenProvider tokens;
    @Autowired ClubProjectSocialService social;
    @Autowired AdminService admin;
    @Autowired ClubProjectCommentRepository comments;
    @Autowired ClubProjectLikeRepository likes;

    private Cookie member(String id) {
        return member(id, Member.Role.USER);
    }

    private Cookie member(String id, Member.Role role) {
        Member m = new Member();
        m.setStudentId(id);
        m.setName("회원 " + id);
        m.setEmail(id + "@example.invalid");
        m.setPassword("unused");
        m.setRole(role);
        m.setEmailVerified(true);
        members.save(m);
        return new Cookie("token", tokens.generateToken(id, 0));
    }

    private long work() {
        return projects.create("APP", "작품", null, null, "제작자", null, null, null).id();
    }

    private long postComment(long workId, Cookie member, String content, Long parent) throws Exception {
        String body = parent == null ? "{\"content\":\"" + content + "\"}"
                : "{\"content\":\"" + content + "\",\"parentCommentId\":" + parent + "}";
        String json = mvc.perform(post("/api/club-projects/{id}/comments", workId).cookie(member)
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    @Test
    void detailCountsEachRequestWithoutRewritingWorkAndLikesAreIdempotent() throws Exception {
        long id = work();
        Cookie one = member("2099000101");
        Cookie two = member("2099000102");
        var before = projects.get(id).getUpdatedAt();

        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewCount").value(1))
                .andExpect(jsonPath("$.likeCount").value(0)).andExpect(jsonPath("$.commentCount").value(0))
                .andExpect(jsonPath("$.likedByMe").value(false))
                .andExpect(jsonPath("$.ownerStudentId").doesNotExist());
        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewCount").value(2));
        assertThat(projects.get(id).getUpdatedAt()).isEqualTo(before);

        mvc.perform(put("/api/club-projects/{id}/like", id).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"liked\":true}"))
                .andExpect(status().isUnauthorized());
        for (int i = 0; i < 2; i++) mvc.perform(put("/api/club-projects/{id}/like", id).cookie(one)
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"liked\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.likeCount").value(1))
                .andExpect(jsonPath("$.likedByMe").value(true));
        mvc.perform(put("/api/club-projects/{id}/like", id).cookie(two)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"liked\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.likeCount").value(2));
        mvc.perform(put("/api/club-projects/{id}/like", id).cookie(one)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"liked\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(put("/api/club-projects/{id}/like", id).cookie(one)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"liked\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(get("/api/club-projects").cookie(two))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == " + id + ")].likedByMe").value(true));
        mvc.perform(get("/api/club-projects/{id}", Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    void commentsArePublicToReadButOnlyAuthorsCanEditAndParentRemovalDeletesReplies() throws Exception {
        long id = work();
        long otherWork = work();
        Cookie owner = member("2099000103");
        Cookie other = member("2099000104");
        mvc.perform(post("/api/club-projects/{id}/comments", id).header("Origin", ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"안녕\"}"))
                .andExpect(status().isUnauthorized());
        long parent = postComment(id, owner, "첫 댓글", null);
        long reply = postComment(id, other, "답글", parent);
        mvc.perform(get("/api/club-projects/{id}/comments", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].authorName").value("회원 2099000103"))
                .andExpect(jsonPath("$[0].editable").value(false))
                .andExpect(jsonPath("$[1].parentCommentId").value(parent))
                .andExpect(jsonPath("$[0].studentId").doesNotExist());
        mvc.perform(get("/api/club-projects/{id}/comments", id).cookie(owner))
                .andExpect(jsonPath("$[0].editable").value(true))
                .andExpect(jsonPath("$[1].editable").value(false));
        mvc.perform(patch("/api/club-projects/{id}/comments/{commentId}", id, parent).cookie(other)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"탈취\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/club-projects/{id}/comments/{commentId}", id, parent).cookie(other)
                .header("Origin", ORIGIN)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/club-projects/{id}/comments/{commentId}", id, parent).cookie(owner)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"수정한 댓글\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("수정한 댓글"));
        mvc.perform(patch("/api/club-projects/{id}/comments/{commentId}", otherWork, parent).cookie(owner)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"탈취\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/club-projects/{id}/comments", otherWork).cookie(other)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"교차 작품\",\"parentCommentId\":" + parent + "}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(jsonPath("$.commentCount").value(2));
        mvc.perform(get("/api/club-projects")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].commentCount").value(2));
        mvc.perform(delete("/api/club-projects/{id}/comments/{commentId}", id, parent).cookie(owner)
                .header("Origin", ORIGIN)).andExpect(status().isNoContent());
        mvc.perform(get("/api/club-projects/{id}/comments", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(jsonPath("$.commentCount").value(0));
        assertThat(reply).isPositive();
    }

    @Test
    void unsafeTextIsRejectedAndRepliesStopAtDepthThirty() throws Exception {
        long id = work();
        Cookie author = member("2099000105");
        mvc.perform(post("/api/club-projects/{id}/comments", id).cookie(author)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"<script>alert(1)</script>\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/club-projects/{id}/comments", id).cookie(author)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/club-projects/{id}/comments", id).cookie(author)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"" + "x".repeat(1001) + "\"}"))
                .andExpect(status().isBadRequest());
        long parent = postComment(id, author, "root", null);
        // A fresh member for each level avoids the 12-write limit masking the depth rule.
        for (int depth = 1; depth <= 30; depth++) {
            Cookie writer = member("209901" + String.format("%04d", depth));
            parent = postComment(id, writer, "depth " + depth, parent);
        }
        mvc.perform(post("/api/club-projects/{id}/comments", id).cookie(author)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"too deep\",\"parentCommentId\":" + parent + "}"))
                .andExpect(status().isBadRequest());
        postComment(id, author, "const x = 1;", null);
    }

    @Test
    void commentWritesAreLimitedAndManagerCanDeleteButCannotRewriteAnotherMember() throws Exception {
        long id = work();
        Cookie writer = member("2099000106");
        Cookie manager = member("2099000107", Member.Role.ADMIN);
        long first = 0;
        for (int i = 0; i < 12; i++) {
            long next = postComment(id, writer, "message " + i, null);
            if (i == 0) first = next;
        }
        mvc.perform(post("/api/club-projects/{id}/comments", id).cookie(writer)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"thirteenth\"}"))
                .andExpect(status().isTooManyRequests());
        mvc.perform(patch("/api/club-projects/{id}/comments/{commentId}", id, first).cookie(writer)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"edited\"}"))
                .andExpect(status().isTooManyRequests());
        mvc.perform(patch("/api/club-projects/{id}/comments/{commentId}", id, first).cookie(manager)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"manager rewrite\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/club-projects/{id}/comments", id).cookie(manager))
                .andExpect(jsonPath("$[0].editable").value(false))
                .andExpect(jsonPath("$[0].deletable").value(true));
        mvc.perform(delete("/api/club-projects/{id}/comments/{commentId}", id, first).cookie(manager)
                .header("Origin", ORIGIN)).andExpect(status().isNoContent());
    }

    @Test
    void concurrentLikesForOneMemberStayUnique() throws Exception {
        long id = work();
        member("2099000108");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var tasks = java.util.List.<java.util.concurrent.Callable<Long>>of(
                    () -> social.setLike(id, "2099000108", true).likeCount(),
                    () -> social.setLike(id, "2099000108", true).likeCount());
            for (var result : pool.invokeAll(tasks)) assertThat(result.get(10, TimeUnit.SECONDS)).isEqualTo(1L);
        }
        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(jsonPath("$.likeCount").value(1));
    }

    @Test
    void leavingMemberCannotPassOwnershipToFutureSignup() throws Exception {
        Cookie owner = member("2099000109");
        Cookie other = member("2099000110");
        long id = projects.createForMember("2099000109", "APP", "계정 작품", "소개", null, null).id();
        postComment(id, owner, "삭제할 댓글", null);
        long parent = postComment(id, owner, "삭제할 부모", null);
        postComment(id, other, "함께 지워질 답글", parent);
        for (int i = 0; i < 10; i++) postComment(id, owner, "탈퇴 전 " + i, null);
        social.setLike(id, "2099000109", true);
        admin.deleteByStudentId("2099000109");
        mvc.perform(get("/api/club-projects/{id}", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.madeBy").value("회원 2099000109"))
                .andExpect(jsonPath("$.likeCount").value(0)).andExpect(jsonPath("$.commentCount").value(0));
        member("2099000109");
        mvc.perform(get("/api/club-projects/{id}", id).cookie(owner))
                .andExpect(jsonPath("$.canEdit").value(false));
        postComment(id, owner, "재가입 후 새 댓글", null);
    }

    @Test
    void deletingWorkRemovesItsLikesAndComments() throws Exception {
        long id = work();
        Cookie author = member("2099000111");
        long parent = postComment(id, author, "root", null);
        postComment(id, author, "reply", parent);
        social.setLike(id, "2099000111", true);
        projects.delete(id);
        assertThat(comments.countByClubProjectId(id)).isZero();
        assertThat(likes.countByClubProjectId(id)).isZero();
        mvc.perform(get("/api/club-projects/{id}", id)).andExpect(status().isNotFound());
    }
}
