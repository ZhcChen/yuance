CREATE TABLE work_item_saved_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    name TEXT NOT NULL,
    keyword TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT '',
    assignee_username TEXT NOT NULL DEFAULT '',
    cycle_id INTEGER REFERENCES project_cycles (id) ON DELETE SET NULL,
    sort_by TEXT NOT NULL DEFAULT 'updated_desc',
    per_page INTEGER NOT NULL DEFAULT 10,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (item_type IN ('requirement', 'task', 'bug')),
    CHECK (sort_by IN ('updated_desc', 'created_desc', 'priority_desc', 'due_date_asc')),
    CHECK (per_page >= 1 AND per_page <= 100),
    CHECK (is_default IN (0, 1)),
    UNIQUE (user_id, project_id, item_type, name)
);

CREATE INDEX idx_work_item_saved_views_scope
    ON work_item_saved_views (user_id, project_id, item_type, updated_at DESC, id DESC);

CREATE UNIQUE INDEX idx_work_item_saved_views_default_scope
    ON work_item_saved_views (user_id, project_id, item_type)
    WHERE is_default = 1;
