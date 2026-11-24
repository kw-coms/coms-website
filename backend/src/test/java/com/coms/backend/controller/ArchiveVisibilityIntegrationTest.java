package com.coms.backend.controller;

import com.coms.backend.domain.ArchiveFile;
import com.coms.backend.domain.Member;
import com.coms.backend.domain.MemberPermissionOverride;
import com.coms.backend.domain.Permission;
import com.coms.backend.repository.ArchiveFileRepository;
import com.coms.backend.repository.MemberRepository;
import com.coms.backend.repository.MemberPermissionOverrideRepository;
import com.coms.backend.security.JwtTokenProvider;
import com.coms.backend.service.ArchiveService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

@SpringBootTest(properties = {
        "jwt.secret=test-secret-key-with-at-least-32-chars",
        "spring.datasource.url=jdbc:h2:mem:archive-visibility-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
        "storage.location=./build/test-uploads/archive-visibility"
})
@AutoConfigureMockMvc
@Transactional
class ArchiveVisibilityIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ArchiveService archiveService;
    @Autowired ArchiveFileRepository files;
    @Autowired MemberRepository members;
    @Autowired MemberPermissionOverrideRepository overrides;
    @Autowired JwtTokenProvider tokens;
    @Autowired JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    private final Map<Member.Role, String> ids = new EnumMap<>(Member.Role.class);
    private Long publicId, membersId, officersId, selectedId, attachmentId;
    private String chosenId, uploaderId;

    @BeforeEach
    void setUp() throws Exception {
        int number = 1;
        for (Member.Role role : Member.Role.values()) {
            String id = String.format("20261100%02d", number++);
            ids.put(role, id);
            saveMember(id, role);
        }
        chosenId = "2026110010";
        uploaderId = "2026110011";
        saveMember(chosenId, Member.Role.USER);
        saveMember(uploaderId, Member.Role.USER);
        publicId = upload("public", ArchiveFile.Visibility.PUBLIC, ids.get(Member.Role.ADMIN), Set.of());
        membersId = upload("members", ArchiveFile.Visibility.MEMBERS, ids.get(Member.Role.ADMIN), Set.of());
        officersId = upload("officers", ArchiveFile.Visibility.OFFICERS, ids.get(Member.Role.ADMIN), Set.of());
        selectedId = upload("selected", ArchiveFile.Visibility.SELECTED, uploaderId, Set.of(chosenId));
        attachmentId = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .filter(file -> file.id().equals(selectedId)).findFirst().orElseThrow().attachments().get(0).id();
    }

    @Test
    void guestListAndDetailHideUploaderStudentIdButKeepDisplayName() throws Exception {
        JsonNode guestList = body(get("/api/files"), null);
        assertThat(guestList.size()).isEqualTo(1);
        JsonNode guestDetail = body(get("/api/files/" + publicId), null);
        for (JsonNode file : List.of(guestList.get(0), guestDetail)) {
            assertThat(file.path("uploadedBy").isNull()).isTrue();
            assertThat(file.path("uploaderName").asText()).isEqualTo("Member " + ids.get(Member.Role.ADMIN));
        }
        assertThat(body(get("/api/files/" + publicId), uploaderId).path("uploadedBy").asText())
                .isEqualTo(ids.get(Member.Role.ADMIN));
    }

    @Test
    void guestDetailAndDownloadsDoNotCountViews() throws Exception {
        assertThat(body(get("/api/files/" + publicId), null).path("viewCount").asLong()).isZero();
        assertThat(status(get("/api/files/" + publicId + "/download"), null)).isEqualTo(200);
        Long publicAttachment = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .filter(file -> file.id().equals(publicId)).findFirst().orElseThrow().attachments().get(0).id();
        assertThat(status(get("/api/files/" + publicId + "/attachments/" + publicAttachment + "/download"), null))
                .isEqualTo(200);
        assertThat(jdbc.queryForObject("select view_count from archive_files where id = ?", Long.class, publicId)).isZero();
    }

    @Test
    void memberDetailAndEachDownloadIncrementViewsOnce() throws Exception {
        assertThat(body(get("/api/files/" + publicId), uploaderId).path("viewCount").asLong()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select view_count from archive_files where id = ?", Long.class, publicId)).isEqualTo(1);
        assertThat(status(get("/api/files/" + publicId + "/download"), uploaderId)).isEqualTo(200);
        assertThat(jdbc.queryForObject("select view_count from archive_files where id = ?", Long.class, publicId)).isEqualTo(2);
        Long publicAttachment = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .filter(file -> file.id().equals(publicId)).findFirst().orElseThrow().attachments().get(0).id();
        assertThat(status(get("/api/files/" + publicId + "/attachments/" + publicAttachment + "/download"), uploaderId))
                .isEqualTo(200);
        assertThat(jdbc.queryForObject("select view_count from archive_files where id = ?", Long.class, publicId)).isEqualTo(3);
    }

    @Test
    void everyArchiveReadUsesTheSameVisibilityMatrix() throws Exception {
        record Viewer(String id, Set<ArchiveFile.Visibility> visible) {}
        List<Viewer> viewers = List.of(
                new Viewer(null, Set.of(ArchiveFile.Visibility.PUBLIC)),
                new Viewer(ids.get(Member.Role.ASSOCIATE), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS)),
                new Viewer(ids.get(Member.Role.USER), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS)),
                new Viewer(ids.get(Member.Role.OFFICER), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.OFFICERS)),
                new Viewer(ids.get(Member.Role.VICE_PRESIDENT), Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.OFFICERS)),
                new Viewer(chosenId, Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.SELECTED)),
                new Viewer(uploaderId, Set.of(ArchiveFile.Visibility.PUBLIC, ArchiveFile.Visibility.MEMBERS, ArchiveFile.Visibility.SELECTED)),
                new Viewer(ids.get(Member.Role.ADMIN), Set.of(ArchiveFile.Visibility.values()))
        );
        Map<ArchiveFile.Visibility, Long> rows = Map.of(
                ArchiveFile.Visibility.PUBLIC, publicId,
                ArchiveFile.Visibility.MEMBERS, membersId,
                ArchiveFile.Visibility.OFFICERS, officersId,
                ArchiveFile.Visibility.SELECTED, selectedId
        );
        Map<Long, Long> attachmentIds = archiveService.list(ids.get(Member.Role.ADMIN)).stream()
                .collect(java.util.stream.Collectors.toMap(file -> file.id(), file -> file.attachments().get(0).id()));
        for (Viewer viewer : viewers) {
            JsonNode list = body(get("/api/files"), viewer.id());
            for (var entry : rows.entrySet()) {
                boolean allowed = viewer.visible().contains(entry.getKey());
                assertThat(list.toString().contains("\"id\":" + entry.getValue() + ","))
                        .as("list %s %s", viewer.id(), entry.getKey()).isEqualTo(allowed);
                for (String path : List.of("/api/files/%d", "/api/files/%d/download", "/api/files/%d/inline",
                        "/api/files/%d/attachments/" + attachmentIds.get(entry.getValue()) + "/download")) {
                    assertThat(status(get(path.formatted(entry.getValue())), viewer.id()))
                            .as("%s %s %s", viewer.id(), entry.getKey(), path)
                            .isEqualTo(allowed ? 200 : 404);
                }
            }
            if (viewer.id() != null) {
                JsonNode mobile = body(get("/api/mobile/v1/home"), viewer.id());
                for (var entry : rows.entrySet()) {
                    assertThat(mobile.path("quickFiles").toString().contains("\"id\":" + entry.getValue() + ","))
                            .as("mobile %s %s", viewer.id(), entry.getKey())
                            .isEqualTo(viewer.visible().contains(entry.getKey()));
                    assertThat(status(post("/api/files/%d/vote".formatted(entry.getValue()))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"), viewer.id()))
                            .as("vote %s %s", viewer.id(), entry.getKey())
                            .isEqualTo(viewer.visible().contains(entry.getKey()) ? 200 : 404);
                }
            } else {
                assertThat(status(get("/api/mobile/v1/home"), null)).isEqualTo(401);
                for (Long id : rows.values()) {
                    assertThat(status(post("/api/files/%d/vote".formatted(id))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"value\":1}"), null)).isEqualTo(401);
                }
            }
        }
    }

    @Test
    void uploaderCanSelectBasicVisibilityButRestrictedSelectionNeedsGrant() throws Exception {
        assertThat(body(get("/api/files/" + selectedId), chosenId).path("selectedStudentIds").size()).isZero();
        assertThat(body(get("/api/files/" + selectedId), ids.get(Member.Role.ADMIN))
                .path("selectedStudentIds").get(0).asText()).isEqualTo(chosenId);
        int memberDefault = status(patch("/api/files/%d/visibility".formatted(membersId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"PUBLIC\"}"), uploaderId);
        assertThat(memberDefault).isEqualTo(403);
        assertThat(status(patch("/api/files/%d/visibility".formatted(selectedId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"PUBLIC\"}"), uploaderId)).isEqualTo(403);
        assertThat(status(patch("/api/files/%d/visibility".formatted(selectedId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"SELECTED\",\"selectedStudentIds\":[\"" + chosenId + "\"]}"), uploaderId)).isEqualTo(403);
        assertThat(status(get("/api/files/visibility-members?query=2026"), uploaderId)).isEqualTo(403);
        assertThat(status(get("/api/files/visibility-members?query=2026"), ids.get(Member.Role.ADMIN))).isEqualTo(200);
    }

    @Test
    void uploaderWithoutGrantCanOnlySwitchBetweenPublicAndMembers() throws Exception {
        for (boolean put : List.of(false, true)) {
            for (ArchiveFile.Visibility from : ArchiveFile.Visibility.values()) {
                for (ArchiveFile.Visibility to : ArchiveFile.Visibility.values()) {
                    Long id = upload("transition", from, uploaderId,
                            from == ArchiveFile.Visibility.SELECTED ? Set.of(chosenId) : Set.of());
                    boolean basic = (from == ArchiveFile.Visibility.PUBLIC || from == ArchiveFile.Visibility.MEMBERS)
                            && (to == ArchiveFile.Visibility.PUBLIC || to == ArchiveFile.Visibility.MEMBERS);
                    assertThat(changeVisibility(id, to, uploaderId, put))
                            .as("%s %s -> %s", put ? "PUT" : "PATCH", from, to).isEqualTo(basic ? 200 : 403);
                    assertThat(files.findById(id).orElseThrow().getVisibility()).isEqualTo(basic ? to : from);
                }
            }
        }
    }

    @Test
    void individualVisibilityGrantAllowsRestrictedChangesAndRevokeStopsThem() throws Exception {
        overrides.saveAndFlush(new MemberPermissionOverride(uploaderId, Permission.ARCHIVE_VISIBILITY,
                MemberPermissionOverride.Effect.GRANT, ids.get(Member.Role.ADMIN)));
        for (boolean put : List.of(false, true)) {
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.OFFICERS, uploaderId, put)).isEqualTo(200);
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.SELECTED, uploaderId, put)).isEqualTo(200);
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.PUBLIC, uploaderId, put)).isEqualTo(200);
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.SELECTED, uploaderId, put)).isEqualTo(200);
        }
        overrides.saveAndFlush(new MemberPermissionOverride(uploaderId, Permission.ARCHIVE_VISIBILITY,
                MemberPermissionOverride.Effect.REVOKE, ids.get(Member.Role.ADMIN)));
        for (boolean put : List.of(false, true)) {
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.PUBLIC, uploaderId, put)).isEqualTo(403);
            assertThat(changeVisibility(selectedId, ArchiveFile.Visibility.OFFICERS, uploaderId, put)).isEqualTo(403);
            assertThat(files.findById(selectedId).orElseThrow().getVisibility()).isEqualTo(ArchiveFile.Visibility.SELECTED);
        }
    }

    @Test
    void uploaderVisibilityRevokeOverridesRoleGrant() throws Exception {
        String vicePresident = ids.get(Member.Role.VICE_PRESIDENT);
        Long id = upload("role grant revoked", ArchiveFile.Visibility.SELECTED, vicePresident, Set.of(chosenId));
        assertThat(changeVisibility(id, ArchiveFile.Visibility.OFFICERS, vicePresident, false)).isEqualTo(200);
        overrides.saveAndFlush(new MemberPermissionOverride(vicePresident, Permission.ARCHIVE_VISIBILITY,
                MemberPermissionOverride.Effect.REVOKE, ids.get(Member.Role.ADMIN)));
        for (boolean put : List.of(false, true)) {
            assertThat(changeVisibility(id, ArchiveFile.Visibility.PUBLIC, vicePresident, put)).isEqualTo(403);
        }
    }

    @Test
    void uploaderCanReadAndEditOfficerFileWithoutChangingItsVisibility() throws Exception {
        Long id = upload("own officer file", ArchiveFile.Visibility.OFFICERS, uploaderId, Set.of());
        assertThat(body(get("/api/files/" + id), uploaderId).path("id").asLong()).isEqualTo(id);
        assertThat(body(get("/api/files"), uploaderId).toString()).contains("\"id\":" + id + ",");
        assertThat(archiveService.listLimited(1, uploaderId)).extracting("id").containsExactly(id);
        assertThat(status(get("/api/files/" + id + "/download"), uploaderId)).isEqualTo(200);
        var edited = archiveService.updateGroup(uploaderId, id, "edited title", null, "GENERAL", null, null);
        assertThat(edited.title()).isEqualTo("edited title");
        assertThat(edited.visibility()).isEqualTo("OFFICERS");
        assertThat(status(get("/api/files/" + id), chosenId)).isEqualTo(404);
        assertThat(body(get("/api/files"), chosenId).toString()).doesNotContain("\"id\":" + id + ",");
    }

    private int changeVisibility(Long id, ArchiveFile.Visibility visibility, String actor, boolean put) throws Exception {
        if (put) {
            var request = multipart(org.springframework.http.HttpMethod.PUT, "/api/files/" + id)
                    .param("title", "updated").param("category", "GENERAL").param("visibility", visibility.name());
            if (visibility == ArchiveFile.Visibility.SELECTED) request.param("selectedStudentIds", chosenId);
            return status(request, actor);
        }
        return status(patch("/api/files/" + id + "/visibility").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("visibility", visibility.name(),
                        "selectedStudentIds", visibility == ArchiveFile.Visibility.SELECTED ? List.of(chosenId) : List.of()))), actor);
    }

    private Long upload(String title, ArchiveFile.Visibility visibility, String uploader, Set<String> selected) throws Exception {
        var response = archiveService.uploadGroup(title, null, "GENERAL",
                List.of(new MockMultipartFile("files", title + ".pdf", "application/pdf", "%PDF-1.4".getBytes())),
                ids.get(Member.Role.ADMIN));
        ArchiveFile row = files.findById(response.id()).orElseThrow();
        row.setUploadedBy(uploader);
        row.setVisibility(visibility);
        row.setSelectedStudentIds(selected);
        files.saveAndFlush(row);
        return row.getId();
    }

    private void saveMember(String id, Member.Role role) {
        Member member = new Member();
        member.setStudentId(id);
        member.setName("Member " + id);
        member.setEmail(id + "@example.com");
        member.setPassword("encoded");
        member.setEmailVerified(true);
        member.setRole(role);
        members.save(member);
    }

    private int status(AbstractMockHttpServletRequestBuilder<?> request, String id) throws Exception {
        if (id != null) request.cookie(new Cookie("token", tokens.generateToken(id, 0)));
        request.header("Origin", "http://localhost:5173");
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    private JsonNode body(AbstractMockHttpServletRequestBuilder<?> request, String id) throws Exception {
        if (id != null) request.cookie(new Cookie("token", tokens.generateToken(id, 0)));
        var response = mvc.perform(request).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return json.readTree(response.getContentAsString());
    }
}
