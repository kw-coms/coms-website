package com.coms.backend.dto;

import java.math.BigDecimal;

public record HackathonScoresRequest(BigDecimal themeFit, BigDecimal creativity, BigDecimal technology,
                                     BigDecimal completeness, BigDecimal practicality, String feedback) {}
