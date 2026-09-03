-- Refresh-token 회전(rotation) + 재사용 감지(reuse detection)용 세션 테이블.
-- 한 기기의 로그인 = 하나의 family. 회전할 때마다 새 jti 행이 같은 family 로 이어지고,
-- 이미 회전된(revoked) 토큰이 다시 들어오면 그 family 전체를 폐기한다.
--
-- NOT NULL 컬럼에는 DEFAULT 를 붙인다 — 엔티티의 columnDefinition 과 짝을 이뤄
-- hibernate 가 만든 스키마 위에 이 스크립트를 재생해도 깨지지 않게 한다.
CREATE TABLE IF NOT EXISTS refresh_sessions (
    id BIGSERIAL PRIMARY KEY,
    jti VARCHAR(64) NOT NULL,
    family VARCHAR(64) NOT NULL,
    student_id VARCHAR(32) NOT NULL,
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    replaced_by VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_sessions_jti ON refresh_sessions (jti);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_family ON refresh_sessions (family);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_student_id ON refresh_sessions (student_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires_at ON refresh_sessions (expires_at);
