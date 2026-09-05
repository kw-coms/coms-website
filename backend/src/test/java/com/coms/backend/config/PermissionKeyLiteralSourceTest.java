package com.coms.backend.config;

import com.coms.backend.domain.Permission;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scans every {@code @perm.has(authentication,'KEY')} SpEL literal under
 * {@code src/main/java} and asserts each {@code KEY} names an actual
 * {@link Permission} enum constant. Without this, a typo'd key (e.g.
 * {@code 'ARCHIVE_MANGE'}) compiles fine — Spring Security's SpEL evaluator only
 * discovers the mistake at request time, when {@code Permission.fromToken}
 * throws a 400 in production instead of failing the build.
 */
class PermissionKeyLiteralSourceTest {

    private static final Pattern PERM_HAS_LITERAL =
            Pattern.compile("@perm\\.has\\(authentication,\\s*'([A-Za-z_]+)'\\)");

    @Test
    void everyPermHasLiteralNamesAnActualPermissionConstant() throws IOException {
        Path root = Path.of("src/main/java");
        List<String> referencedKeys = new ArrayList<>();
        try (Stream<Path> paths = Files.walk(root)) {
            paths.filter(path -> path.toString().endsWith(".java"))
                    .forEach(path -> referencedKeys.addAll(extractKeys(path)));
        }

        // Sanity check: if the pattern stops matching anything (e.g. the SpEL call
        // shape changes), this test would otherwise pass vacuously.
        assertThat(referencedKeys).isNotEmpty();

        List<String> validNames = Arrays.stream(Permission.values()).map(Permission::name).toList();
        for (String key : referencedKeys) {
            assertThat(validNames)
                    .as("'%s' referenced by @perm.has(authentication,'%s') must be a Permission enum constant", key, key)
                    .contains(key);
        }
    }

    private List<String> extractKeys(Path path) {
        try {
            String source = Files.readString(path);
            Matcher matcher = PERM_HAS_LITERAL.matcher(source);
            List<String> keys = new ArrayList<>();
            while (matcher.find()) {
                keys.add(matcher.group(1));
            }
            return keys;
        } catch (IOException e) {
            throw new RuntimeException("Failed to read " + path, e);
        }
    }
}
