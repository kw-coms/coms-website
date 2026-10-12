package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

/** Signing up to a gathering. {@code note} answers the gathering's question, when it asks one. */
public record GatheringJoinRequest(
        @Size(max = 100) String note
) {
}
