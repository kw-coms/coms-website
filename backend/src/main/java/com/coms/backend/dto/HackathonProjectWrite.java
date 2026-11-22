package com.coms.backend.dto;

import java.math.BigDecimal;
import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

public record HackathonProjectWrite(String title, String author, String description,
                                    String github, String live, @Schema(implementation = Integer.class, type = "integer", format = "int32") BigDecimal position,
                                    String teamName, Boolean published, List<Long> memberIds, Long version) {}
