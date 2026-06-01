CREATE TABLE IF NOT EXISTS members (
    id          BIGSERIAL PRIMARY KEY,
    student_id  VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    department  VARCHAR(255),
    phone       VARCHAR(255),
    role        VARCHAR(50)  NOT NULL DEFAULT 'USER',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archive_files (
    id            BIGSERIAL PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    stored_name   VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(255) NOT NULL,
    file_size     BIGINT       NOT NULL,
    uploaded_by   VARCHAR(255) NOT NULL,
    uploaded_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
