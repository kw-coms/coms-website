package com.coms.backend.dto;

import java.math.BigDecimal;
import io.swagger.v3.oas.annotations.media.Schema;

public record HackathonEventWrite(String title, @Schema(implementation = Integer.class, type = "integer", format = "int32") BigDecimal year,
                                  @Schema(implementation = Integer.class, type = "integer", format = "int32") BigDecimal semester,
                                  String theme, String introduction, String rules) {}
