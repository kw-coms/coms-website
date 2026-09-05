package com.coms.backend.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Set;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

public enum Permission {
    CLUB_ROOM_VIEW(
            "club_room.view",
            "동방 비밀번호 보기",
            "동방 출입 비밀번호를 조회할 수 있습니다.",
            Set.of(Member.Role.USER, Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    COMMUNITY_ANONYMOUS_BOARD(
            "community.anonymous_board",
            "익명게시판 이용",
            "익명 커뮤니티 게시판을 이용할 수 있습니다.",
            Set.of(Member.Role.USER, Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    COMMUNITY_MODERATE(
            "community.moderate",
            "커뮤니티 중재",
            "글 고정, 신고 처리, 삭제 보관함, 익명 작성자 확인을 수행할 수 있습니다.",
            Set.of(Member.Role.VICE_PRESIDENT)
    ),
    NOTICE_WRITE(
            "notice.write",
            "공지 작성·수정·삭제·고정",
            "공지사항을 작성, 수정, 삭제, 고정할 수 있습니다.",
            Set.of(Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    ACTIVITY_WRITE(
            "activity.write",
            "활동·일정·이벤트·정기일정·카테고리 관리",
            "활동, 일정, 이벤트, 정기일정, 활동 카테고리를 관리할 수 있습니다.",
            Set.of(Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    PROJECT_WRITE(
            "project.write",
            "COM's 프로젝트 관리",
            "COM's 프로젝트와 프로젝트 카테고리를 관리할 수 있습니다.",
            Set.of(Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    ARCHIVE_MANAGE(
            "archive.manage",
            "자료실 삭제·작성자 변경",
            "자료실 파일을 삭제하고 작성자를 변경할 수 있습니다.",
            Set.of(Member.Role.VICE_PRESIDENT)
    ),
    SITE_SETTINGS_EDIT(
            "site_settings.edit",
            "사이트 문구·동방 비번 편집",
            "사이트 공개 문구와 동방 비밀번호를 편집할 수 있습니다.",
            Set.of(Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    ),
    OPERATIONS_PANEL(
            "operations.panel",
            "운영 패널 메뉴 표시",
            "운영 패널 메뉴/탭 표시 여부만 제어합니다 — 각 탭의 기능은 개별 권한으로 제어됩니다.",
            Set.of(Member.Role.OFFICER, Member.Role.VICE_PRESIDENT)
    );

    private final String key;
    private final String label;
    private final String description;
    private final Set<Member.Role> defaultRoles;

    Permission(String key, String label, String description, Set<Member.Role> defaultRoles) {
        this.key = key;
        this.label = label;
        this.description = description;
        this.defaultRoles = Set.copyOf(defaultRoles);
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }

    public Set<Member.Role> defaultRoles() {
        return defaultRoles;
    }

    public static Permission fromKey(String key) {
        return Arrays.stream(values())
                .filter(permission -> permission.key.equals(key))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "알 수 없는 권한입니다: " + key));
    }

    public static Permission fromToken(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "권한 값이 비어 있습니다.");
        }
        try {
            return Permission.valueOf(token);
        } catch (IllegalArgumentException ignored) {
            return fromKey(token);
        }
    }

    @Converter(autoApply = false)
    public static class KeyConverter implements AttributeConverter<Permission, String> {
        @Override
        public String convertToDatabaseColumn(Permission permission) {
            return permission == null ? null : permission.key();
        }

        @Override
        public Permission convertToEntityAttribute(String key) {
            return key == null ? null : Permission.fromKey(key);
        }
    }
}
