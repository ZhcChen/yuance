CREATE TABLE system_api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_suffix TEXT NOT NULL,
    token_ciphertext TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '[]',
    created_by_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    updated_by_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    last_used_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_system_api_tokens_updated
ON system_api_tokens (updated_at DESC, id DESC);

CREATE INDEX idx_system_api_tokens_created_by
ON system_api_tokens (created_by_user_id, updated_at DESC, id DESC);
