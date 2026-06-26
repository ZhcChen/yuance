ALTER TABLE storage_configs
ADD COLUMN access_key_id_ciphertext TEXT NOT NULL DEFAULT '';

CREATE TABLE storage_config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storage_config_id INTEGER NOT NULL REFERENCES storage_configs (id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    bucket TEXT NOT NULL,
    access_key_id_hint TEXT NOT NULL DEFAULT '',
    access_key_id_ciphertext TEXT NOT NULL DEFAULT '',
    access_key_secret_ciphertext TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (storage_config_id, version)
);

CREATE INDEX idx_storage_config_versions_config ON storage_config_versions (storage_config_id, version DESC);

CREATE TABLE file_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storage_config_id INTEGER REFERENCES storage_configs (id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'aliyun_oss',
    bucket TEXT NOT NULL DEFAULT '',
    object_key TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    checksum_sha256 TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'deleted')),
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_objects_status ON file_objects (status, created_at DESC);
CREATE INDEX idx_file_objects_config ON file_objects (storage_config_id, created_at DESC);

CREATE TABLE file_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_object_id INTEGER NOT NULL REFERENCES file_objects (id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'work_item', 'comment')),
    target_id INTEGER NOT NULL,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (file_object_id, target_type, target_id)
);

CREATE INDEX idx_file_attachments_target ON file_attachments (target_type, target_id, created_at DESC);
