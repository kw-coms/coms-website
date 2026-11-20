-- 해커톤 아카이브: 개발 기간(서울 벽시계 시각)과 결과 공개 여부. 운영 날짜는 관리자가 직접 입력한다.
ALTER TABLE hackathon_events ADD COLUMN starts_at TIMESTAMP NULL;
ALTER TABLE hackathon_events ADD COLUMN ends_at TIMESTAMP NULL;
ALTER TABLE hackathon_events ADD COLUMN results_published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hackathon_events ADD CONSTRAINT ck_hackathon_event_period
    CHECK ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at <= ends_at));
