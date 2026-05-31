package com.coms.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "jwt.secret=test-secret-key-with-at-least-32-chars")
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
