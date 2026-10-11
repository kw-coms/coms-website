package com.coms.backend.web;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;

class SafeMediaTypesTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "application/pdf",
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/x-hwp",
            "image/png",
            "image/jpeg",
            "video/mp4",
            "text/plain",
            "text/csv"
    })
    void keepsTheDeclaredTypeOfPassiveFiles(String declared) {
        assertThat(SafeMediaTypes.forDownload(declared)).isEqualTo(MediaType.parseMediaType(declared));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            // Anything a browser would run or apply if a page pointed <script>/<link> at the download.
            "text/javascript",
            "application/javascript",
            "application/x-javascript",
            "application/ecmascript",
            "text/css",
            "text/html",
            "application/xhtml+xml",
            "text/xml",
            "application/xml",
            "image/svg+xml",
            "application/json",
            "application/wasm",
            "TEXT/JavaScript; charset=utf-8"
    })
    void servesActiveTypesAsOpaqueBytes(String declared) {
        assertThat(SafeMediaTypes.forDownload(declared)).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
    }

    @Test
    void fallsBackForMissingOrMalformedTypes() {
        assertThat(SafeMediaTypes.forDownload(null)).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(SafeMediaTypes.forDownload("  ")).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(SafeMediaTypes.forDownload("not a media type")).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(SafeMediaTypes.parseOrOctetStream("not a media type")).isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        assertThat(SafeMediaTypes.parseOrOctetStream("image/png")).isEqualTo(MediaType.IMAGE_PNG);
    }
}
