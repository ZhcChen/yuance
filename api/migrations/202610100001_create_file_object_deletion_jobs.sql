CREATE TABLE file_object_deletion_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_object_id INTEGER NOT NULL UNIQUE REFERENCES file_objects (id) ON DELETE RESTRICT,
    storage_config_id INTEGER REFERENCES storage_configs (id) ON DELETE RESTRICT,
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TEXT NOT NULL,
    lease_until TEXT,
    lease_token TEXT,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    CHECK (
        (status = 'processing' AND lease_until IS NOT NULL AND lease_token IS NOT NULL)
        OR (status <> 'processing' AND lease_until IS NULL AND lease_token IS NULL)
    )
);

CREATE INDEX idx_file_object_deletion_jobs_due
ON file_object_deletion_jobs (status, next_attempt_at, lease_until, id);
