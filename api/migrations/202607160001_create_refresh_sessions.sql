CREATE TABLE refresh_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_status TEXT NOT NULL DEFAULT 'active' CHECK (session_status IN ('active', 'revoked', 'expired')),
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT,
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_refresh_sessions_user ON refresh_sessions (user_id, session_status);
CREATE INDEX idx_refresh_sessions_hash ON refresh_sessions (refresh_token_hash);
