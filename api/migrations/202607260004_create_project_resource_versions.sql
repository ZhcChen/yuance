CREATE TABLE project_resource_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL REFERENCES project_resources (id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    body_format TEXT NOT NULL DEFAULT 'html' CHECK (body_format IN ('plain', 'html')),
    tags_json TEXT NOT NULL DEFAULT '[]',
    related_work_item_key TEXT NOT NULL DEFAULT '',
    related_work_item_type TEXT NOT NULL DEFAULT '',
    related_work_item_title TEXT NOT NULL DEFAULT '',
    related_cycle_id INTEGER,
    related_cycle_name TEXT NOT NULL DEFAULT '',
    related_cycle_start_date TEXT NOT NULL DEFAULT '',
    related_cycle_end_date TEXT NOT NULL DEFAULT '',
    edited_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    edited_by_display_name_snapshot TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (resource_id, version_number)
);

CREATE INDEX idx_project_resource_versions_resource
    ON project_resource_versions (resource_id, version_number DESC, id DESC);
