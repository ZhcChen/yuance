CREATE TABLE project_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('integration', 'customer', 'meeting', 'implementation', 'other')),
    body TEXT NOT NULL DEFAULT '',
    body_format TEXT NOT NULL DEFAULT 'html' CHECK (body_format IN ('plain', 'html')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    access_password_hash TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    updated_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    archived_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_resources_project_status ON project_resources (project_id, status, updated_at DESC, id DESC);
CREATE INDEX idx_project_resources_project_category ON project_resources (project_id, category, status, updated_at DESC);
CREATE INDEX idx_project_resources_created_by ON project_resources (created_by_user_id, created_at DESC);

PRAGMA foreign_keys = OFF;

CREATE TABLE file_attachments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_object_id INTEGER NOT NULL REFERENCES file_objects (id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'work_item', 'comment', 'project_resource')),
    target_id INTEGER NOT NULL,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (file_object_id, target_type, target_id)
);

INSERT INTO file_attachments_new (
    id,
    file_object_id,
    target_type,
    target_id,
    created_by_user_id,
    created_at
)
SELECT
    id,
    file_object_id,
    target_type,
    target_id,
    created_by_user_id,
    created_at
FROM file_attachments;

DROP TABLE file_attachments;
ALTER TABLE file_attachments_new RENAME TO file_attachments;

CREATE INDEX idx_file_attachments_target ON file_attachments (target_type, target_id, created_at DESC);

PRAGMA foreign_keys = ON;
