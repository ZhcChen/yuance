CREATE TABLE system_release_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    retention_count INTEGER NOT NULL DEFAULT 5 CHECK (retention_count >= 1 AND retention_count <= 50),
    updated_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO system_release_settings (id, retention_count)
VALUES (1, 5)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE system_release_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_name TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TEXT,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    updated_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_system_release_versions_status
ON system_release_versions (status, published_at DESC, updated_at DESC, id DESC);

CREATE INDEX idx_system_release_versions_updated
ON system_release_versions (updated_at DESC, id DESC);

CREATE TABLE system_release_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL REFERENCES system_release_versions (id) ON DELETE CASCADE,
    file_object_id INTEGER NOT NULL UNIQUE REFERENCES file_objects (id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux', 'android', 'ios')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_system_release_assets_release
ON system_release_assets (release_id, created_at DESC, id DESC);

CREATE INDEX idx_system_release_assets_platform
ON system_release_assets (platform, created_at DESC, id DESC);
