package com.coms.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The ceiling on request bodies that are not uploads, against a real HTTP server: a body sent with
 * chunked transfer encoding has no length to check up front, and a mock request cannot show what
 * the container does with one.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "jwt.secret=test-secret-key-with-at-least-32-chars",
                "cors.allowed-origins=https://coms.kw.ac.kr",
                "spring.datasource.url=jdbc:h2:mem:request-body-limit-test;MODE=PostgreSQL;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
                "app.max-request-body-bytes=4096",
                // Small on purpose: a multipart body that is parsed at all trips it.
                "spring.servlet.multipart.max-request-size=2KB"
        })
class RequestBodyLimitTest {

    private static final String ORIGIN = "https://coms.kw.ac.kr";
    private static final int CEILING = 4096;

    @LocalServerPort
    private int port;

    private final HttpClient client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Test
    void anAnonymousJsonBodyOverTheCeilingIsRefusedBeforeItIsParsed() throws Exception {
        byte[] body = loginBody(CEILING + 1);

        HttpResponse<String> response = send(json("/api/auth/login").POST(BodyPublishers.ofByteArray(body)));

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        assertThat(response.body()).isEqualTo("{\"message\":\"요청 본문이 너무 큽니다.\"}");
        // Still readable by the browser client: the refusal comes after the CORS filter.
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains(ORIGIN);
    }

    @Test
    void aBodyAtTheCeilingReachesTheEndpoint() throws Exception {
        HttpResponse<String> response = send(json("/api/auth/login").POST(BodyPublishers.ofByteArray(loginBody(CEILING))));

        assertThat(response.statusCode()).isNotEqualTo(413).isLessThan(500);
    }

    @Test
    void aChunkedBodyOverTheCeilingGetsTheSameRefusal() throws Exception {
        byte[] body = loginBody(CEILING * 4);

        // No Content-Length: the client streams it with Transfer-Encoding: chunked.
        HttpResponse<String> response = send(json("/api/auth/login")
                .POST(BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body))));

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("요청 본문이 너무 큽니다.");
    }

    @Test
    void aSmallChunkedBodyIsReadNormally() throws Exception {
        byte[] body = "{\"identifier\":\"nobody\",\"password\":\"wrong-password\"}".getBytes(StandardCharsets.UTF_8);

        HttpResponse<String> response = send(json("/api/auth/login")
                .POST(BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body))));

        assertThat(response.statusCode()).isNotEqualTo(413).isLessThan(500);
    }

    @Test
    void anUploadIsNotSubjectToTheJsonCeiling() throws Exception {
        String boundary = "----comsBoundary7MA4YWxk";
        String head = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"notes.txt\"\r\n"
                + "Content-Type: text/plain\r\n\r\n";
        String tail = "\r\n--" + boundary + "--\r\n";
        byte[] body = (head + "x".repeat(CEILING * 3) + tail).getBytes(StandardCharsets.UTF_8);

        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/files"))
                .header("Origin", ORIGIN)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(BodyPublishers.ofByteArray(body)));

        // Refused for not being signed in, which is the endpoint's own answer, not the ceiling's.
        assertThat(response.statusCode()).isIn(401, 403);
    }

    @Test
    void aMultipartBodyIsNotParsedForAnEndpointThatTakesNoParts() throws Exception {
        String boundary = "----comsBoundary7MA4YWxk";
        byte[] body = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"big.bin\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n"
                + "x".repeat(CEILING * 3) + "\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);

        // An anonymous JSON endpoint. Parsed eagerly, the body would be read in full (and spooled
        // to disk) before the handler was even chosen — here that would answer 413, because it is
        // over this test's multipart limit. Left alone, it is simply the wrong media type.
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/recruit/apply"))
                .header("Origin", ORIGIN)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(BodyPublishers.ofByteArray(body)));

        assertThat(response.statusCode()).isEqualTo(415);
    }

    @Test
    void requestsWithoutABodyAreUntouched() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/actuator/health")).GET());

        assertThat(response.statusCode()).isEqualTo(200);
    }

    private HttpRequest.Builder json(String path) {
        return HttpRequest.newBuilder(uri(path))
                .header("Origin", ORIGIN)
                .header("Content-Type", "application/json");
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return client.send(request.timeout(Duration.ofSeconds(15)).build(), BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    /** A syntactically valid login body of exactly {@code size} bytes. */
    private static byte[] loginBody(int size) {
        String prefix = "{\"identifier\":\"nobody\",\"password\":\"";
        String suffix = "\"}";
        String body = prefix + "p".repeat(size - prefix.length() - suffix.length()) + suffix;
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        if (bytes.length != size) {
            throw new IllegalStateException("fixture size mismatch");
        }
        return bytes;
    }
}
