package com.coms.backend.dto;

import java.util.List;

public record YouTubeSearchResponse(List<Item> items) {
    public record Item(String videoId, String title, String thumbnailUrl, String channelTitle) {}
}
