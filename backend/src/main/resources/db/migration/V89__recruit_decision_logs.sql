-- 불합격(REJECTED) 처리도 합격과 마찬가지로 지원서를 삭제하되 처리 이력은 남긴다.
-- 별도 테이블을 새로 만들지 않고 기존 recruit_promotion_logs 를 재사용한다 — 이제 이
-- 테이블은 "합격 이관 이력"이 아니라 "지원 처리 이력(합격/불합격)"을 담는다.
-- NOT NULL 컬럼에는 DEFAULT 를 붙인다 — 엔티티의 columnDefinition 과 짝을 이뤄
-- hibernate 가 만든 스키마 위에 이 스크립트를 재생해도 깨지지 않게 한다.
ALTER TABLE recruit_promotion_logs ADD COLUMN IF NOT EXISTS decision VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE recruit_promotion_logs ADD COLUMN IF NOT EXISTS admin_note VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_recruit_promotion_logs_decision_promoted_at
    ON recruit_promotion_logs (decision, promoted_at DESC);
