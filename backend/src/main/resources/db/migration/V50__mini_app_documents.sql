CREATE TABLE mini_app_documents (
    id BIGSERIAL PRIMARY KEY,
    app VARCHAR(30) NOT NULL,
    content_type VARCHAR(30) NOT NULL,
    content_id VARCHAR(120) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(500),
    owner_student_id VARCHAR(50) NOT NULL,
    owner_name VARCHAR(100),
    shared BOOLEAN NOT NULL DEFAULT FALSE,
    share_slug VARCHAR(80),
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    shared_at TIMESTAMP
);

CREATE UNIQUE INDEX uk_mini_app_document_owner_content
    ON mini_app_documents(app, content_type, owner_student_id, content_id);

CREATE UNIQUE INDEX uk_mini_app_document_share_slug
    ON mini_app_documents(share_slug);

CREATE INDEX idx_mini_app_documents_owner_updated
    ON mini_app_documents(app, owner_student_id, updated_at DESC);

CREATE INDEX idx_mini_app_documents_shared
    ON mini_app_documents(app, shared, shared_at DESC);
