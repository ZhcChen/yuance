CREATE TABLE file_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES file_folders (id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_folders_project ON file_folders (project_id, status, created_at DESC);
CREATE INDEX idx_file_folders_parent ON file_folders (parent_id, status, created_at DESC);
CREATE UNIQUE INDEX idx_file_folders_unique_name ON file_folders (project_id, parent_id, name) WHERE status = 'active';

ALTER TABLE file_objects
ADD COLUMN folder_id INTEGER REFERENCES file_folders (id) ON DELETE SET NULL;

CREATE INDEX idx_file_objects_folder ON file_objects (folder_id, status, created_at DESC);
