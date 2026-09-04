package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 정렬 순서 변경: 화면에 보이는 순서대로의 id 목록. */
public record SponsorReorderRequest(
        @NotNull @Size(max = 500) List<Long> ids
) {
}
