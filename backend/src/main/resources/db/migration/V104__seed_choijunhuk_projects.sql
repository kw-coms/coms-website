-- Add 12 public projects by 최준혁 (github.com/choijunhuk) to both COMS Apps catalogs,
-- club_projects (Projects page) and app_catalog_entries (Apps hub), as V65 did for PRDoctor.
-- Admins may already have registered some of them by hand in production, so each row is
-- skipped when the target table already has any row that:
--   1. has the same title (case-insensitive), or
--   2. has the same link (case-insensitive), or
--   3. links to the project's GitHub repo path (/choijunhuk/<repo>), or
--   4. links to the project's deployed host path (choijunhuk.github.io/<repo>), when it has one.
-- Matching is case-insensitive substring matching on the link, so a trailing slash, a
-- /releases or /tree/main suffix, or http vs https does not defeat the guard.
-- Rows are appended after the existing ones: position / sort_order = MAX + n (n = 1..12).
-- Re-running is harmless: after the first run every row matches rule 1, so nothing is inserted
-- (and Flyway never re-applies a version that has already succeeded).
-- Not seeded on purpose: the private repos hogwarts-life-sim, Project-ASCENT and invest.
INSERT INTO club_projects (category, title, description, eyebrow, made_by, link_url, display_url, position)
SELECT s.category,
       s.title,
       s.description,
       s.eyebrow,
       '최준혁',
       s.link,
       s.display_url,
       (SELECT COALESCE(MAX(position), -1) FROM club_projects) + s.n
FROM (VALUES
    (1, 'GAME', 'Packet Trail',
     '심야의 의뢰를 따라 서버에 들어가 자료를 회수하고, 가상 OS의 터미널과 해킹 도구로 사건의 진실을 추적하는 해킹 시뮬레이션 게임입니다.',
     'Godot 해킹 시뮬레이션', 'https://github.com/choijunhuk/packet-trail', 'github.com/choijunhuk/packet-trail',
     'packet-trail', ''),
    (2, 'GAME', 'History Heroes',
     '역사 속 인물이 되어 던전을 돌파하고 빌드를 쌓아 보스에게 도전하는 아처 스타일의 안드로이드 로그라이크 게임입니다.',
     'Unity 모바일 로그라이크', 'https://github.com/choijunhuk/history-heroes/releases', 'github.com/choijunhuk/history-heroes/releases',
     'history-heroes', ''),
    (3, 'GAME', 'Magic Survival Lab',
     '마법과 유물을 조합해 여러 지역의 적과 보스를 버텨내는 모바일 생존 게임으로, 웹 체험판을 바로 실행해볼 수 있습니다.',
     'Godot 서바이벌 액션', 'https://choijunhuk.github.io/magic-survival-lab/', 'choijunhuk.github.io/magic-survival-lab',
     'magic-survival-lab', 'choijunhuk.github.io/magic-survival-lab'),
    (4, 'WEBSITE', 'PhoneMote',
     'Android 폰의 자이로와 가속도 센서를 Wii 리모컨처럼 사용해 PC 브라우저 게임을 즐기는 모션 컨트롤러입니다.',
     'WebRTC 모션 컨트롤러', 'https://choijunhuk.github.io/phonemote/', 'choijunhuk.github.io/phonemote',
     'phonemote', 'choijunhuk.github.io/phonemote'),
    (5, 'GAME', 'Memory Forge',
     '동료를 모집·편성하고 턴제 카드 전투와 탐사를 거치며 변화를 기억으로 남겨 성장하는 서브컬처 덱빌딩 RPG입니다.',
     'Unity 덱빌딩 RPG', 'https://github.com/choijunhuk/memory-forge-rpg', 'github.com/choijunhuk/memory-forge-rpg',
     'memory-forge-rpg', ''),
    (6, 'APP', 'COM’s Companion',
     '동아리 운영자가 Android에서 회원, 행사, 회비, 연락을 관리하고 회원은 작은 웹에서 참석과 일정 투표를 제출하는 운영 보조 앱입니다.',
     'Android 동아리 운영', 'https://github.com/choijunhuk/coms-companion', 'github.com/choijunhuk/coms-companion',
     'coms-companion', ''),
    (7, 'WEBSITE', 'NetLab',
     'PC, Server, Switch, Router를 연결해 ARP, IPv4 라우팅, TCP, DHCP, DNS, NAT 처리 과정을 단계별로 따라가 보는 브라우저 기반 네트워크 학습 시뮬레이터입니다.',
     '네트워크 프로토콜 시뮬레이터', 'https://choijunhuk.github.io/netlab/', 'choijunhuk.github.io/netlab',
     'netlab', 'choijunhuk.github.io/netlab'),
    (8, 'GAME', 'Arcade Kart Racer',
     '드라이버와 카트, 트랙, 아이템을 고르고 싱글 레이스, 그랑프리, 로컬 멀티플레이를 즐기는 오리지널 3D 아케이드 카트 레이싱 게임입니다.',
     'Godot 3D 카트 레이싱', 'https://github.com/choijunhuk/arcade-kart-racer', 'github.com/choijunhuk/arcade-kart-racer',
     'arcade-kart-racer', ''),
    (9, 'APP', 'Chrona',
     '일정에 끌 때까지 울리는 알람을 붙일 수 있고 시간표, 과제 D-day, 집중 타이머도 제공하는 캘린더와 알람시계 결합형 안드로이드 앱입니다.',
     'Android 일정 알람', 'https://github.com/choijunhuk/chrona', 'github.com/choijunhuk/chrona',
     'chrona', ''),
    (10, 'WEBSITE', 'BarMate',
     '가진 재료로 만들 수 있는 칵테일 찾기, 취향 기반 와인 추천, 위스키 시세, 음식 페어링을 한곳에 모은 홈바 웹앱입니다.',
     '홈바 웹앱', 'https://github.com/choijunhuk/barmate/releases', 'github.com/choijunhuk/barmate/releases',
     'barmate', ''),
    (11, 'APP', 'chip8-rs',
     'CPU와 명령어 해석까지 처음부터 직접 구현한 CHIP-8 및 Super-CHIP 1.1 에뮬레이터로, 데스크톱 창에서 ROM을 실행합니다.',
     'Rust 에뮬레이터', 'https://github.com/choijunhuk/chip8-rs', 'github.com/choijunhuk/chip8-rs',
     'chip8-rs', ''),
    (12, 'WEBSITE', 'KW Algorithm Lab',
     '정렬, 탐색, 그래프, DP, 트리 알고리즘의 실행 과정을 단계별로 재생하고 비교하며 설명할 수 있는 학습 도구입니다.',
     '알고리즘 시각화 학습', 'https://choijunhuk.github.io/kw-algorithm-lab/', 'choijunhuk.github.io/kw-algorithm-lab',
     'kw-algorithm-lab', 'choijunhuk.github.io/kw-algorithm-lab')
) AS s(n, category, title, description, eyebrow, link, display_url, repo, host)
WHERE NOT EXISTS (
    SELECT 1 FROM club_projects p
    WHERE lower(p.title) = lower(s.title)
       OR lower(p.link_url) = lower(s.link)
       OR lower(p.link_url) LIKE '%/choijunhuk/' || lower(s.repo) || '%'
       OR (s.host <> '' AND lower(p.link_url) LIKE '%' || lower(s.host) || '%')
);

INSERT INTO app_catalog_entries (title, eyebrow, body, href, sort_order)
SELECT s.title,
       s.eyebrow,
       s.body,
       s.link,
       (SELECT COALESCE(MAX(sort_order), -1) FROM app_catalog_entries) + s.n
FROM (VALUES
    (1, 'Packet Trail', 'Godot 해킹 시뮬레이션', '가상 OS와 해킹 도구로 사건을 추적하는 시뮬레이션 게임입니다.',
     'https://github.com/choijunhuk/packet-trail', 'packet-trail', ''),
    (2, 'History Heroes', 'Unity 모바일 로그라이크', '역사 인물이 되어 던전을 돌파하는 로그라이크 게임입니다.',
     'https://github.com/choijunhuk/history-heroes/releases', 'history-heroes', ''),
    (3, 'Magic Survival Lab', 'Godot 서바이벌 액션', '마법을 조합해 적을 버텨내는 모바일 생존 게임입니다.',
     'https://choijunhuk.github.io/magic-survival-lab/', 'magic-survival-lab', 'choijunhuk.github.io/magic-survival-lab'),
    (4, 'PhoneMote', 'WebRTC 모션 컨트롤러', '폰 센서로 PC 브라우저 게임을 조작하는 컨트롤러입니다.',
     'https://choijunhuk.github.io/phonemote/', 'phonemote', 'choijunhuk.github.io/phonemote'),
    (5, 'Memory Forge', 'Unity 덱빌딩 RPG', '동료와 카드 전투로 성장하는 덱빌딩 RPG입니다.',
     'https://github.com/choijunhuk/memory-forge-rpg', 'memory-forge-rpg', ''),
    (6, 'COM’s Companion', 'Android 동아리 운영', '회원, 행사, 회비를 관리하는 동아리 운영 앱입니다.',
     'https://github.com/choijunhuk/coms-companion', 'coms-companion', ''),
    (7, 'NetLab', '네트워크 프로토콜 시뮬레이터', '네트워크 처리 과정을 단계별로 보는 학습 시뮬레이터입니다.',
     'https://choijunhuk.github.io/netlab/', 'netlab', 'choijunhuk.github.io/netlab'),
    (8, 'Arcade Kart Racer', 'Godot 3D 카트 레이싱', '오리지널 3D 아케이드 카트 레이싱 게임입니다.',
     'https://github.com/choijunhuk/arcade-kart-racer', 'arcade-kart-racer', ''),
    (9, 'Chrona', 'Android 일정 알람', '끌 때까지 울리는 알람을 붙이는 캘린더 앱입니다.',
     'https://github.com/choijunhuk/chrona', 'chrona', ''),
    (10, 'BarMate', '홈바 웹앱', '칵테일, 와인, 위스키 추천을 모은 홈바 웹앱입니다.',
     'https://github.com/choijunhuk/barmate/releases', 'barmate', ''),
    (11, 'chip8-rs', 'Rust 에뮬레이터', 'CHIP-8과 Super-CHIP 에뮬레이터입니다.',
     'https://github.com/choijunhuk/chip8-rs', 'chip8-rs', ''),
    (12, 'KW Algorithm Lab', '알고리즘 시각화 학습', '알고리즘 실행 과정을 단계별로 재생하는 학습 도구입니다.',
     'https://choijunhuk.github.io/kw-algorithm-lab/', 'kw-algorithm-lab', 'choijunhuk.github.io/kw-algorithm-lab')
) AS s(n, title, eyebrow, body, link, repo, host)
WHERE NOT EXISTS (
    SELECT 1 FROM app_catalog_entries e
    WHERE lower(e.title) = lower(s.title)
       OR lower(e.href) = lower(s.link)
       OR lower(e.href) LIKE '%/choijunhuk/' || lower(s.repo) || '%'
       OR (s.host <> '' AND lower(e.href) LIKE '%' || lower(s.host) || '%')
);
