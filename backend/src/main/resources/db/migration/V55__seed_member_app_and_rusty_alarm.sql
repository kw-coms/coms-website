-- Add two more member-built projects to the 앱 (APP) category: the COMS member
-- mobile app and Rusty Alarm. Both built by 최준혁; linked to their GitHub repos.
INSERT INTO club_projects (category, title, description, eyebrow, made_by, link_url, display_url, position) VALUES
    ('APP', 'COMS Member App', '공지·커뮤니티·활동 기록·알림을 한곳에서 확인하는 COMS 회원 전용 모바일 앱입니다. (Android/iOS, Capacitor)', 'Member app', '최준혁', 'https://github.com/choijunhuk/coms-member-app', 'github.com/choijunhuk/coms-member-app', 9),
    ('APP', 'Rusty Alarm', 'Rust로 만든 알람 앱입니다.', 'Alarm', '최준혁', 'https://github.com/choijunhuk/rusty-alarm', 'github.com/choijunhuk/rusty-alarm', 10);
