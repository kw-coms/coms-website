package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

/**
 * 회장 전용 작성자 변경. Exactly one of the two:
 * - studentId: reassign the post to that member (display name follows them)
 * - name: override only the displayed author name, ownership unchanged
 */
public record CommunityAuthorUpdateRequest(
        @Size(max = 20) String studentId,
        // 100 is what the deletion snapshot keeps (deleted_community_posts.author_name) and
        // what the member app's field allows; 60 answered a name the app accepted with a 400.
        @Size(max = 100) String name
) {
}
