package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.dto.ClubProjectLinkStatusResponse;
import com.coms.backend.repository.ClubProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * What the catalogue link check concludes from what a link answers. No request leaves the
 * machine: the fetch and the name lookup are stand-ins.
 */
class ClubProjectLinkStatusServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-12T08:00:00Z"), ZoneId.of("Asia/Seoul"));

    private final ClubProjectRepository repository = mock(ClubProjectRepository.class);
    /** What each address answers, in order; an Integer is a status, an exception is thrown. */
    private final Map<String, List<Object>> answers = new HashMap<>();
    private final List<String> fetched = new ArrayList<>();
    private final List<String> unknownHosts = new ArrayList<>();

    private final ClubProjectLinkStatusService service = new ClubProjectLinkStatusService(
            repository,
            url -> {
                fetched.add(url);
                List<Object> queue = answers.get(url);
                Object next = queue.size() > 1 ? queue.remove(0) : queue.get(0);
                if (next instanceof IOException io) throw io;
                if (next instanceof RuntimeException runtime) throw runtime;
                return (Integer) next;
            },
            host -> {
                if (unknownHosts.contains(host)) throw new UnknownHostException(host);
            },
            CLOCK,
            Duration.ZERO);

    @Test
    void aLinkThatAnswersIsUpWhateverItSaysShortOfMissingOrBroken() {
        catalogue(project(1, "https://a.example/"), project(2, "https://b.example/login"), project(3, "https://c.example/"),
                project(4, "https://d.example/"), project(5, "https://e.example/"));
        answer("https://a.example/", 200);
        answer("https://b.example/login", 403);
        answer("https://c.example/", 401);
        answer("https://d.example/", 429);
        // The last of too many redirects is still an answer.
        answer("https://e.example/", 302);

        service.checkAll();

        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::state).containsOnly("UP");
        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::projectId).containsExactly(1L, 2L, 3L, 4L, 5L);
        assertThat(service.list().get(0).checkedAt()).isEqualTo(LocalDateTime.of(2026, 10, 12, 17, 0));
        assertThat(fetched).hasSize(5);
    }

    @Test
    void aMissingPageOrAServerErrorIsDownAfterASecondTry() {
        catalogue(project(1, "https://a.example/"), project(2, "https://b.example/"), project(3, "https://c.example/"), project(4, "https://d.example/"));
        answer("https://a.example/", 502);
        answer("https://b.example/", 404);
        answer("https://c.example/", 410);
        answer("https://d.example/", 500);

        service.checkAll();

        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::state).containsOnly("DOWN");
        // Each was asked twice before it was called down.
        assertThat(fetched).hasSize(8);
    }

    @Test
    void oneLostRequestIsNotAnOutage() {
        catalogue(project(1, "https://a.example/"), project(2, "https://b.example/"));
        answer("https://a.example/", new IOException("timed out"), 200);
        answer("https://b.example/", 503, 200);

        service.checkAll();

        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::state).containsExactly("UP", "UP");
        assertThat(fetched).hasSize(4);
    }

    @Test
    void nothingAnsweringTwiceIsDown() {
        catalogue(project(1, "https://a.example/"), project(2, "https://b.example/"));
        answer("https://a.example/", new IOException("connection refused"));
        answer("https://b.example/", new IllegalArgumentException("malformed redirect"));

        service.checkAll();

        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::state).containsExactly("DOWN", "DOWN");
    }

    @Test
    void aNameThatNoLongerResolvesIsDownWithoutAFetch() {
        catalogue(project(1, "https://gone.example/app"));
        unknownHosts.add("gone.example");

        service.checkAll();

        assertThat(service.list()).singleElement().satisfies(status -> assertThat(status.state()).isEqualTo("DOWN"));
        assertThat(fetched).isEmpty();
    }

    @Test
    void anAddressTheServerDoesNotFetchIsUnknownNotDown() {
        catalogue(project(1, "https://intranet.example/"), project(2, "ftp://files.example/app.zip"), project(3, "mailto:club@example.com"), project(4, "https:///no-host"));
        answer("https://intranet.example/", new ResponseStatusException(HttpStatus.BAD_REQUEST, "허용되지 않는 링크 주소입니다."));

        service.checkAll();

        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::state).containsOnly("UNKNOWN");
        // Refused once is refused: no second try, and what is not a web address is never fetched.
        assertThat(fetched).containsExactly("https://intranet.example/");
    }

    @Test
    void anHttpLinkIsCheckedInItsHttpsFormAndReportedAsWritten() {
        catalogue(project(1, "http://kw.example/"), project(2, "HTTP://Upper.example/Path"));
        answer("https://kw.example/", 502);
        answer("https://Upper.example/Path", 200);

        service.checkAll();

        assertThat(fetched).contains("https://kw.example/", "https://Upper.example/Path");
        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::linkUrl, ClubProjectLinkStatusResponse::state)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("http://kw.example/", "DOWN"),
                        org.assertj.core.groups.Tuple.tuple("HTTP://Upper.example/Path", "UP"));
    }

    @Test
    void entriesWithoutALinkAreLeftOutAndGoneOnesAreForgotten() {
        catalogue(project(1, "https://a.example/"), project(2, "   "), project(3, null), project(4, "https://d.example/"));
        answer("https://a.example/", 200);
        answer("https://d.example/", 200);
        service.checkAll();
        assertThat(service.list()).extracting(ClubProjectLinkStatusResponse::projectId).containsExactly(1L, 4L);

        // Entry 4 is deleted, entry 1 loses its link, entry 2 gets one.
        catalogue(project(1, ""), project(2, " https://b.example/ "));
        answer("https://b.example/", 200);
        service.checkAll();

        assertThat(service.list()).singleElement().satisfies(status -> {
            assertThat(status.projectId()).isEqualTo(2L);
            // Surrounding spaces are not part of the address.
            assertThat(status.linkUrl()).isEqualTo("https://b.example/");
        });
    }

    @Test
    void nothingIsKnownBeforeTheFirstLook() {
        assertThat(service.list()).isEmpty();
    }

    @Test
    void whichStatusesCountAsAnAnswer() {
        for (int status : new int[]{200, 204, 301, 304, 400, 401, 403, 405, 429}) {
            assertThat(ClubProjectLinkStatusService.answers(status)).as("status %d", status).isTrue();
        }
        for (int status : new int[]{0, 404, 410, 500, 502, 503, 504}) {
            assertThat(ClubProjectLinkStatusService.answers(status)).as("status %d", status).isFalse();
        }
    }

    private void catalogue(ClubProject... projects) {
        when(repository.findAll()).thenReturn(List.of(projects));
    }

    private void answer(String url, Object... results) {
        answers.put(url, new ArrayList<>(List.of(results)));
    }

    private static ClubProject project(long id, String linkUrl) {
        ClubProject project = new ClubProject();
        ReflectionTestUtils.setField(project, "id", id);
        project.setLinkUrl(linkUrl);
        return project;
    }
}
