package com.coms.backend.service;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.dto.ClubProjectLinkStatusResponse;
import com.coms.backend.repository.ClubProjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Looks at the links of the app catalogue ("COM's Apps") and remembers whether each one
 * answered, so the page can say when an app is not responding instead of sending a visitor to
 * an error page. {@link ClubProjectLinkStatusJob} calls {@link #checkAll()} on a timer; the
 * results live in memory and start empty after a restart.
 *
 * <p>The fetch itself is {@link LinkPreviewService}'s guarded one: https only, standard ports,
 * public addresses, on every redirect too. A link written with http is checked in its https
 * form. An address that fetch refuses is reported as unknown, never as down.
 */
@Service
public class ClubProjectLinkStatusService {
    static final String UP = "UP";
    static final String DOWN = "DOWN";
    static final String UNKNOWN = "UNKNOWN";

    private static final Logger log = LoggerFactory.getLogger(ClubProjectLinkStatusService.class);
    /** A link that fails is tried once more before it is called down: one lost request is not an outage. */
    private static final Duration RETRY_PAUSE = Duration.ofSeconds(3);

    /** What answers at an https address, after redirects. */
    @FunctionalInterface
    interface Probe {
        int finalStatus(String httpsUrl) throws IOException;
    }

    /** Whether a host name still resolves. */
    @FunctionalInterface
    interface Resolver {
        void resolve(String host) throws UnknownHostException;
    }

    private final ClubProjectRepository repository;
    private final Probe probe;
    private final Resolver resolver;
    private final Clock clock;
    private final Duration retryPause;
    private final Map<Long, ClubProjectLinkStatusResponse> statuses = new ConcurrentHashMap<>();

    @Autowired
    public ClubProjectLinkStatusService(ClubProjectRepository repository, LinkPreviewService linkPreviewService, Clock clock) {
        this(repository, linkPreviewService::finalStatus, linkPreviewService::requireResolvable, clock, RETRY_PAUSE);
    }

    ClubProjectLinkStatusService(ClubProjectRepository repository, Probe probe, Resolver resolver, Clock clock, Duration retryPause) {
        this.repository = repository;
        this.probe = probe;
        this.resolver = resolver;
        this.clock = clock;
        this.retryPause = retryPause;
    }

    /** What the last look found, one entry per catalogue item that has a link. */
    public List<ClubProjectLinkStatusResponse> list() {
        return statuses.values().stream()
                .sorted(Comparator.comparing(ClubProjectLinkStatusResponse::projectId))
                .toList();
    }

    /** Looks at every link once. Entries that are gone, or no longer have a link, are forgotten. */
    public void checkAll() {
        Set<Long> withLink = new HashSet<>();
        int down = 0;
        for (ClubProject project : repository.findAll()) {
            String link = project.getLinkUrl() == null ? "" : project.getLinkUrl().trim();
            if (link.isEmpty()) continue;
            withLink.add(project.getId());
            String state = stateOf(link);
            if (DOWN.equals(state)) down++;
            statuses.put(project.getId(), new ClubProjectLinkStatusResponse(project.getId(), link, state, LocalDateTime.now(clock)));
        }
        statuses.keySet().retainAll(withLink);
        // Counts only: an address in the log would be no secret, but nothing needs it there.
        log.info("App catalogue links checked: {} looked at, {} not answering", withLink.size(), down);
    }

    private String stateOf(String link) {
        String url = checkableForm(link);
        String host = url == null ? null : hostOf(url);
        if (host == null) return UNKNOWN;
        for (int attempt = 1; ; attempt++) {
            try {
                // A name that no longer resolves is an app that is gone, which the guarded
                // fetch would report the same way as an address it refuses.
                resolver.resolve(host);
                if (answers(probe.finalStatus(url))) return UP;
            } catch (ResponseStatusException refused) {
                // Not an address this server fetches (a private one, an odd port, a redirect to
                // plain http): nothing can be said about it.
                return UNKNOWN;
            } catch (IOException | RuntimeException failed) {
                // No such host, nothing listening, no answer in time, a malformed redirect.
            }
            if (attempt == 2) return DOWN;
            pause();
        }
    }

    private static String hostOf(String url) {
        try {
            String host = URI.create(url).getHost();
            return host == null || host.isBlank() ? null : host;
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    /** The https form of a web address, or null when the link is not one. */
    static String checkableForm(String link) {
        String lower = link.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://")) return link;
        if (lower.startsWith("http://")) return "https://" + link.substring("http://".length());
        return null;
    }

    /**
     * True when the status means something is there. A login wall (401, 403) or a rate limit
     * is an answer; a missing page (404, 410) or a server error is not.
     */
    static boolean answers(int status) {
        return status >= 100 && status < 500 && status != 404 && status != 410;
    }

    private void pause() {
        if (retryPause.isZero()) return;
        try {
            Thread.sleep(retryPause.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
