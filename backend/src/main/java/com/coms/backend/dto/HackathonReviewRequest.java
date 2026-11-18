package com.coms.backend.dto;

import java.math.BigDecimal;

public record HackathonReviewRequest(String projectId, BigDecimal generation, String name,
                                     BigDecimal themeFit, BigDecimal creativity, BigDecimal technology,
                                     BigDecimal completeness, BigDecimal practicality, String feedback) {}
