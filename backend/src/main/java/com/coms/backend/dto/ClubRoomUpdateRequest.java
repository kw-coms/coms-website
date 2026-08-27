package com.coms.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ClubRoomUpdateRequest(@NotNull @Size(max = 60) String doorCode) {
}
