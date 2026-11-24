ALTER TABLE club_activities ALTER COLUMN event_date DROP NOT NULL;
ALTER TABLE club_activities ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE club_activities ADD COLUMN timeline_status VARCHAR(20);
ALTER TABLE club_activities ADD COLUMN show_on_timeline BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE club_activities ADD COLUMN timeline_term VARCHAR(40);
ALTER TABLE club_activities ADD COLUMN date_label VARCHAR(40);
ALTER TABLE club_activities ADD COLUMN timeline_kind_label VARCHAR(40);
ALTER TABLE club_activities ADD COLUMN member_facts TEXT;

INSERT INTO club_activities (kind, category, title, description, event_date, end_date,
    timeline_status, show_on_timeline, timeline_term, date_label, timeline_kind_label, created_by)
VALUES
('ACTIVITY', 'STUDY', '고급 C 프로그래밍 스터디', '고급 C 프로그래밍을 공부하는 2학기 스터디입니다.', NULL, NULL,
 'CONFIRMED', TRUE, '2026 2학기', '2026 2학기', '스터디', 'SYSTEM'),
('ACTIVITY', 'ACHIEVEMENT', '해커톤 결과 · 시상 공지', '평가가 끝나면 결과와 시상을 공지합니다.', NULL, NULL,
 'DONE', TRUE, '2026 2학기', '평가 완료 후', '해커톤', 'SYSTEM'),
('ACTIVITY', 'STUDY', '아두이노 · 알고리즘 스터디', '2학기 스터디로 예정되어 있습니다.', NULL, NULL,
 'PLANNED', TRUE, '2026 2학기', '2026 2학기', '스터디', 'SYSTEM'),
('ACTIVITY', 'PROJECT', '팀 프로젝트', '2학기 프로젝트 활동으로 예정되어 있습니다.', NULL, NULL,
 'PLANNED', TRUE, '2026 2학기', '2026 2학기', '프로젝트', 'SYSTEM'),
('ACTIVITY', 'EVENT', '종강총회 · 에버랜드', '2학기 친목 활동으로 종강총회와 에버랜드가 예정되어 있습니다.', NULL, NULL,
 'PLANNED', TRUE, '2026 2학기', '2026 2학기', '행사', 'SYSTEM');
