package com.coms.backend.service;

import com.coms.backend.dto.LinkPreviewResponse;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fetches and parses OpenGraph/meta metadata for a generic external URL so the editor can
 * render an OG-style link-preview card.
 *
 * <p><b>SSRF hardening</b>: the target URL is attacker-controlled, so before any network
 * call we:
 * <ul>
 *   <li>require {@code https://} and a sane max length;</li>
 *   <li>resolve the host to IP(s) <em>once</em> and reject if any resolves to a private /
 *       loopback / link-local / unique-local / cloud-metadata range;</li>
 *   <li><b>IP-pin the fetch</b>: open the TCP connection to the validated address itself and
 *       layer TLS over that socket, naming the original host only for SNI and for the
 *       certificate check — preventing DNS-rebinding TOCTOU where the resolver returns a public
 *       IP at guard time but a private IP at fetch time;</li>
 *   <li>follow at most a few redirects, putting every hop through the same checks;</li>
 *   <li>cap the time for the whole preview (~5s), the response body read (~256KB), and only
 *       parse {@code text/html}.</li>
 * </ul>
 *
 * <p>The request is written by hand over that socket rather than sent with
 * {@code java.net.http.HttpClient}: the client resolves the request host itself, and addressing
 * it by IP needs a {@code Host} header it refuses to send ("restricted header name"). The
 * earlier implementation did exactly that, so every preview threw before any network call and
 * came back as the fallback card.
 * On any failure/guard-trip it returns a minimal fallback card ({@code title = host}) and
 * never leaks the internal error.
 */
@Service
public class LinkPreviewService {

    private static final int MAX_URL_LENGTH = 2048;
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final int MAX_TITLE_LENGTH = 160;
    private static final int MAX_DESCRIPTION_LENGTH = 280;
    private static final int MAX_SITE_NAME_LENGTH = 80;
    private static final java.util.Set<Integer> ALLOWED_PORTS = java.util.Set.of(80, 443);
    private static final int MAX_PREVIEWS_PER_WINDOW = 20;
    private static final Duration PREVIEW_WINDOW = Duration.ofMinutes(1);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final int MAX_REDIRECTS = 3;
    private static final int MAX_HEADER_LINE_BYTES = 8 * 1024;
    private static final int MAX_HEADER_LINES = 100;
    private static final Pattern CHARSET = Pattern.compile("charset\\s*=\\s*\"?([\\w.:-]+)", Pattern.CASE_INSENSITIVE);
    // Each preview occupies a request thread while it fetches. Beyond this many at once the
    // caller gets the plain card straight away, so previews can never take the API's threads.
    private static final int MAX_CONCURRENT_FETCHES = 8;
    private static final Semaphore FETCH_SLOTS = new Semaphore(MAX_CONCURRENT_FETCHES);
    // Closes a fetch's socket when its time is up. A read timeout cannot do this on its own: it
    // restarts with every byte, and the TLS layer keeps reading until a whole record has arrived,
    // so a server sending one byte every few seconds held the thread for hours.
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "link-preview-watchdog");
        thread.setDaemon(true);
        return thread;
    });

    // Sliding-window limiter keyed on the requesting member. Each preview is an outbound fetch
    // the caller chooses the target of, so an unthrottled endpoint lets one account use the
    // server as a request proxy / scanner. Same shape as the AuthService signup windows.
    private final java.util.Map<String, java.util.Deque<java.time.LocalDateTime>> previewsByMember =
            new java.util.concurrent.ConcurrentHashMap<>();
    private static final String USER_AGENT =
            "Mozilla/5.0 (compatible; ComsLinkPreview/1.0; +https://coms.kw.ac.kr)";

    public LinkPreviewResponse preview(String rawUrl, String memberStudentId) {
        enforcePreviewRateLimit(memberStudentId);
        return preview(rawUrl);
    }

    /** Rate limiter deliberately not applied here — go through {@link #preview(String, String)}. */
    private LinkPreviewResponse preview(String rawUrl) {
        URI uri = parseAndValidate(rawUrl);
        String fallbackTitle = uri.getHost() == null ? "" : uri.getHost();
        if (!FETCH_SLOTS.tryAcquire()) {
            return fallback(rawUrl, fallbackTitle);
        }
        // One budget for the whole preview, redirects included.
        long deadline = System.nanoTime() + REQUEST_TIMEOUT.toNanos();
        try {
            // Resolve once, validate, connect to that address — no second DNS lookup at fetch time.
            InetAddress address = resolveAndGuard(uri.getHost());
            URI current = uri;
            for (int redirects = 0; ; redirects++) {
                FetchedPage page = fetch(current, address, deadline);
                if (page.location() == null) {
                    return page.status() == 200 && page.isHtml()
                            ? parse(rawUrl, current, page)
                            : fallback(rawUrl, fallbackTitle);
                }
                if (redirects == MAX_REDIRECTS) {
                    return fallback(rawUrl, fallbackTitle);
                }
                try {
                    // Where a redirect points is as attacker-chosen as the first address: https
                    // only, standard ports, public addresses — checked again on every hop.
                    current = parseAndValidate(current.resolve(page.location()).toString());
                    address = resolveAndGuard(current.getHost());
                } catch (ResponseStatusException | IllegalArgumentException refused) {
                    return fallback(rawUrl, fallbackTitle);
                }
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            return fallback(rawUrl, fallbackTitle);
        } finally {
            FETCH_SLOTS.release();
        }
    }

    /** What one request brought back. {@code location} is set only for a redirect. */
    record FetchedPage(int status, String contentType, String location, byte[] body) {

        boolean isHtml() {
            String type = contentType.toLowerCase(Locale.ROOT);
            return type.contains("text/html") || type.contains("application/xhtml+xml");
        }

        /** The charset the server declared, or null to let the parser read it from the document. */
        String charset() {
            Matcher matcher = CHARSET.matcher(contentType);
            if (!matcher.find()) {
                return null;
            }
            try {
                return Charset.isSupported(matcher.group(1)) ? matcher.group(1) : null;
            } catch (IllegalArgumentException invalidName) {
                return null;
            }
        }
    }

    /** Package-private for testing against a local socket. */
    FetchedPage fetch(URI uri, InetAddress address, long deadline) throws IOException {
        String host = uri.getHost();
        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        Socket plain = new Socket();
        // The hard stop: whatever the socket is blocked in — the handshake, a read in the middle
        // of a TLS record — closing it from here ends it.
        ScheduledFuture<?> hardStop = WATCHDOG.schedule(() -> closeQuietly(plain),
                remainingMillis(deadline), TimeUnit.MILLISECONDS);
        try (plain) {
            plain.connect(new InetSocketAddress(address, port),
                    Math.min((int) CONNECT_TIMEOUT.toMillis(), remainingMillis(deadline)));
            // TLS over the socket that is already connected to the validated address. The host
            // name travels along for SNI and for the certificate check; nothing resolves it again.
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            try (SSLSocket tls = (SSLSocket) factory.createSocket(plain, host, port, true)) {
                SSLParameters parameters = tls.getSSLParameters();
                // Off by default on a bare SSLSocket: without it any valid certificate would do.
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                tls.setSSLParameters(parameters);
                tls.setSoTimeout(remainingMillis(deadline));
                tls.startHandshake();

                OutputStream out = tls.getOutputStream();
                out.write(requestFor(uri));
                out.flush();
                return readResponse(new BufferedInputStream(new DeadlineInputStream(tls, deadline)), MAX_BODY_BYTES);
            }
        } finally {
            hardStop.cancel(false);
        }
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // Already closed, which is all that was wanted.
        }
    }

    /** The request line and headers for {@code uri}. Package-private for unit testing. */
    static byte[] requestFor(URI uri) {
        // toASCIIString percent-encodes what java.net.URI lets through unescaped (a Korean path).
        URI ascii = URI.create(uri.toASCIIString());
        String target = ascii.getRawPath() == null || ascii.getRawPath().isEmpty() ? "/" : ascii.getRawPath();
        if (ascii.getRawQuery() != null) {
            target += "?" + ascii.getRawQuery();
        }
        String hostHeader = ascii.getPort() == -1 ? ascii.getHost() : ascii.getHost() + ":" + ascii.getPort();
        return ("GET " + target + " HTTP/1.1\r\n"
                + "Host: " + hostHeader + "\r\n"
                + "User-Agent: " + USER_AGENT + "\r\n"
                + "Accept: text/html,application/xhtml+xml\r\n"
                // No compression to undo, and no connection to keep: one request, read to the end.
                + "Accept-Encoding: identity\r\n"
                + "Connection: close\r\n"
                + "\r\n").getBytes(StandardCharsets.US_ASCII);
    }

    /**
     * Reads one HTTP/1.x response. The body is read only for a 200, and never past
     * {@code maxBodyBytes}. Package-private for unit testing.
     */
    static FetchedPage readResponse(InputStream in, int maxBodyBytes) throws IOException {
        String[] statusLine = readLine(in).split(" ", 3);
        if (statusLine.length < 2 || !statusLine[0].startsWith("HTTP/1.")) {
            throw new IOException("Not an HTTP/1.x response");
        }
        int status;
        try {
            status = Integer.parseInt(statusLine[1]);
        } catch (NumberFormatException e) {
            throw new IOException("Malformed status line");
        }

        String contentType = "";
        String location = null;
        boolean chunked = false;
        long contentLength = -1;
        int lines = 0;
        for (String line = readLine(in); !line.isEmpty(); line = readLine(in)) {
            if (++lines > MAX_HEADER_LINES) {
                throw new IOException("Too many header lines");
            }
            int colon = line.indexOf(':');
            if (colon <= 0) {
                continue;
            }
            String value = line.substring(colon + 1).trim();
            switch (line.substring(0, colon).trim().toLowerCase(Locale.ROOT)) {
                case "content-type" -> contentType = value;
                case "location" -> location = value;
                case "transfer-encoding" -> chunked = value.toLowerCase(Locale.ROOT).contains("chunked");
                case "content-length" -> {
                    try {
                        contentLength = Long.parseLong(value);
                    } catch (NumberFormatException e) {
                        contentLength = -1;
                    }
                }
                default -> { }
            }
        }

        boolean redirect = status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
        if (redirect && location != null && !location.isBlank()) {
            return new FetchedPage(status, contentType, location, new byte[0]);
        }
        if (status != 200) {
            return new FetchedPage(status, contentType, null, new byte[0]);
        }
        byte[] body = chunked
                ? readChunked(in, maxBodyBytes)
                : readAtMost(in, contentLength < 0 ? maxBodyBytes : (int) Math.min(maxBodyBytes, contentLength));
        return new FetchedPage(status, contentType, null, body);
    }

    /** One CRLF- (or LF-) terminated header line, without its terminator. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream(128);
        for (int b = in.read(); b != '\n'; b = in.read()) {
            if (b < 0) {
                throw new IOException("Connection closed inside the response head");
            }
            if (line.size() >= MAX_HEADER_LINE_BYTES) {
                throw new IOException("Header line too long");
            }
            line.write(b);
        }
        String text = line.toString(StandardCharsets.ISO_8859_1);
        return text.endsWith("\r") ? text.substring(0, text.length() - 1) : text;
    }

    /** Decodes a chunked body, stopping once {@code maxBytes} have been collected. */
    private static byte[] readChunked(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxBytes, 16 * 1024));
        while (out.size() < maxBytes) {
            String sizeLine = readLine(in);
            int extension = sizeLine.indexOf(';');
            long size;
            try {
                size = Long.parseLong((extension < 0 ? sizeLine : sizeLine.substring(0, extension)).trim(), 16);
            } catch (NumberFormatException e) {
                throw new IOException("Malformed chunk size");
            }
            if (size <= 0) {
                break;
            }
            int wanted = (int) Math.min(size, maxBytes - out.size());
            byte[] chunk = readAtMost(in, wanted);
            out.write(chunk, 0, chunk.length);
            if (chunk.length < size) {
                break;   // the cap was reached, or the server stopped early; either way we are done
            }
            readLine(in);   // the CRLF that closes the chunk
        }
        return out.toByteArray();
    }

    private static int remainingMillis(long deadline) throws SocketTimeoutException {
        long millis = (deadline - System.nanoTime()) / 1_000_000;
        if (millis <= 0) {
            throw new SocketTimeoutException("Link preview took too long");
        }
        return (int) millis;
    }

    /**
     * Reads that give up at a fixed deadline. A socket read timeout on its own restarts with every
     * byte, so a server sending one byte every few seconds could hold the request thread for as
     * long as it liked.
     */
    private static final class DeadlineInputStream extends InputStream {
        private final Socket socket;
        private final InputStream in;
        private final long deadline;

        DeadlineInputStream(Socket socket, long deadline) throws IOException {
            this.socket = socket;
            this.in = socket.getInputStream();
            this.deadline = deadline;
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            return read(one, 0, 1) < 0 ? -1 : one[0] & 0xFF;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            socket.setSoTimeout(remainingMillis(deadline));
            return in.read(buffer, offset, length);
        }
    }

    /** Reads up to {@code maxBytes} from the stream and discards the rest without buffering it. */
    static byte[] readAtMost(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxBytes, 16 * 1024));
        byte[] buffer = new byte[8 * 1024];
        int remaining = maxBytes;
        while (remaining > 0) {
            int read = in.read(buffer, 0, Math.min(buffer.length, remaining));
            if (read < 0) {
                break;
            }
            out.write(buffer, 0, read);
            remaining -= read;
        }
        return out.toByteArray();
    }

    private void enforcePreviewRateLimit(String memberStudentId) {
        String key = memberStudentId == null || memberStudentId.isBlank() ? "unknown" : memberStudentId;
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.LocalDateTime cutoff = now.minus(PREVIEW_WINDOW);
        java.util.Deque<java.time.LocalDateTime> attempts =
                previewsByMember.computeIfAbsent(key, ignored -> new java.util.ArrayDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(cutoff)) {
                attempts.removeFirst();
            }
            if (attempts.size() >= MAX_PREVIEWS_PER_WINDOW) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "링크 미리보기 요청이 많습니다. 잠시 후 다시 시도해주세요.");
            }
            attempts.addLast(now);
        }
        previewsByMember.entrySet().removeIf(entry -> {
            java.util.Deque<java.time.LocalDateTime> q = entry.getValue();
            synchronized (q) {
                return q.isEmpty() || q.peekLast().isBefore(cutoff);
            }
        });
    }

    private URI parseAndValidate(String rawUrl) {
        String trimmed = rawUrl == null ? "" : rawUrl.trim();
        if (trimmed.isBlank() || trimmed.length() > MAX_URL_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 링크 주소가 아닙니다.");
        }
        URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "올바른 링크 주소가 아닙니다.");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 미리보기는 https 주소만 지원합니다.");
        }
        // An explicit port turns the preview into a port scanner for whatever the server can
        // reach: the response shape (fallback vs. parsed card, and how fast it comes back)
        // leaks whether something is listening. Only the standard web ports are allowed.
        int port = uri.getPort();
        if (port != -1 && !ALLOWED_PORTS.contains(port)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 미리보기는 기본 웹 포트(80, 443)만 지원합니다.");
        }
        return uri;
    }

    /**
     * Resolves {@code host} to all its IPs (ONCE), rejects if any is in a blocked range,
     * and returns the first validated address for IP-pinning.
     *
     * <p>Callers <em>must</em> use the returned address as the connection target; no further
     * DNS resolution should occur for this request.
     */
    InetAddress resolveAndGuard(String host) {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 호스트를 확인할 수 없습니다.");
        }
        if (addresses == null || addresses.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "링크 호스트를 확인할 수 없습니다.");
        }
        for (InetAddress address : addresses) {
            if (isBlockedAddress(address)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "허용되지 않는 링크 주소입니다.");
            }
        }
        return addresses[0]; // first validated IP used for pinning
    }

    /**
     * Returns true when the address is in a range that must never be fetched from a
     * server-side request: loopback, any-local (0.0.0.0 / ::), link-local (169.254/16,
     * fe80::/10, incl. the 169.254.169.254 metadata IP), site-local / private IPv4
     * (10/8, 172.16/12, 192.168/16), IPv4 0/8, and IPv6 unique-local (fc00::/7). Any
     * IPv4-mapped IPv6 address is unwrapped and re-checked against the IPv4 rules.
     */
    static boolean isBlockedAddress(InetAddress address) {
        if (address == null) {
            return true;
        }
        if (address.isLoopbackAddress() || address.isAnyLocalAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (bytes.length == 16 && isIpv4Mapped(bytes)) {
            byte[] v4 = new byte[]{bytes[12], bytes[13], bytes[14], bytes[15]};
            return isBlockedIpv4(v4);
        }
        if (bytes.length == 4) {
            return isBlockedIpv4(bytes);
        }
        if (bytes.length == 16) {
            // IPv6 unique-local fc00::/7 (first 7 bits == 1111110). fe80::/10 link-local is
            // already covered by isLinkLocalAddress() above.
            return (bytes[0] & 0xFE) == 0xFC;
        }
        return true;
    }

    private static boolean isIpv4Mapped(byte[] b) {
        for (int i = 0; i < 10; i++) {
            if (b[i] != 0) return false;
        }
        return (b[10] & 0xFF) == 0xFF && (b[11] & 0xFF) == 0xFF;
    }

    private static boolean isBlockedIpv4(byte[] b) {
        int a = b[0] & 0xFF;
        int second = b[1] & 0xFF;
        if (a == 10) return true;                            // 10.0.0.0/8
        if (a == 127) return true;                           // 127.0.0.0/8 loopback
        if (a == 0) return true;                             // 0.0.0.0/8 "this network"
        if (a == 169 && second == 254) return true;          // 169.254.0.0/16 link-local + metadata
        if (a == 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12
        if (a == 192 && second == 168) return true;          // 192.168.0.0/16
        if (a == 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 CGNAT
        if (a == 192 && second == 0 && (b[2] & 0xFF) == 0) return true; // 192.0.0.0/24 IETF protocol assignments
        if (a == 198 && (second == 18 || second == 19)) return true;    // 198.18.0.0/15 benchmarking
        return false;
    }

    private LinkPreviewResponse parse(String url, URI source, FetchedPage page) throws IOException {
        String host = source.getHost();
        // From bytes, not a UTF-8 string: with no declared charset jsoup reads it from the
        // document itself, which is what keeps EUC-KR pages from coming out as mojibake. The base
        // URI is the page actually fetched, so a relative og:image resolves against it.
        Document doc = Jsoup.parse(new ByteArrayInputStream(page.body()), page.charset(), source.toString());
        String title = firstNonBlank(
                metaContent(doc, "og:title"),
                doc.title(),
                host);
        String description = firstNonBlank(
                metaContent(doc, "og:description"),
                metaNameContent(doc, "description"),
                "");
        String siteName = firstNonBlank(
                metaContent(doc, "og:site_name"),
                host);
        String image = absoluteHttpsImage(doc, metaContent(doc, "og:image"));
        return new LinkPreviewResponse(
                url,
                truncate(title, MAX_TITLE_LENGTH),
                truncate(description, MAX_DESCRIPTION_LENGTH),
                image,
                truncate(siteName, MAX_SITE_NAME_LENGTH));
    }

    private LinkPreviewResponse fallback(String url, String host) {
        return new LinkPreviewResponse(url, truncate(host, MAX_TITLE_LENGTH), "", null,
                truncate(host, MAX_SITE_NAME_LENGTH));
    }

    private String metaContent(Document doc, String property) {
        Element el = doc.selectFirst("meta[property=" + property + "]");
        if (el == null) {
            el = doc.selectFirst("meta[name=" + property + "]");
        }
        return el == null ? "" : el.attr("content").trim();
    }

    private String metaNameContent(Document doc, String name) {
        Element el = doc.selectFirst("meta[name=" + name + "]");
        return el == null ? "" : el.attr("content").trim();
    }

    private String absoluteHttpsImage(Document doc, String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return null;
        }
        try {
            URI base = URI.create(doc.baseUri());
            URI resolved = base.resolve(candidate.trim());
            if ("https".equalsIgnoreCase(resolved.getScheme()) && resolved.getHost() != null) {
                String value = resolved.toString();
                return value.length() <= 500 ? value : null;
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String truncate(String value, int maxLength) {
        if (value == null) return "";
        // Angle brackets become look-alikes, as RichContentSanitizer.inertMetadata does when the
        // card is saved: the preview then shows exactly what will be stored.
        String normalized = value.replace('<', '\u2039').replace('>', '\u203A').replaceAll("\\s+", " ").trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
