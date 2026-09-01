-- 합격 처리 시 지원서는 명부로 이관 후 삭제되므로, 이관 이력을 별도 보존한다.
CREATE TABLE recruit_promotion_logs (
    id BIGSERIAL PRIMARY KEY,
    application_id BIGINT,
    name VARCHAR(100) NOT NULL,
    student_id VARCHAR(30),
    department VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(255),
    generation VARCHAR(10),
    promoted_by VARCHAR(30),
    promoted_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruit_promotion_logs_promoted_at ON recruit_promotion_logs (promoted_at DESC);
