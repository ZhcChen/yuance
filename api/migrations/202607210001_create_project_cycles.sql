CREATE TABLE project_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    owner_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_cycles_project ON project_cycles (project_id, sort_order ASC, start_date DESC, id DESC);
CREATE INDEX idx_project_cycles_owner ON project_cycles (owner_user_id, updated_at DESC);

ALTER TABLE work_items
ADD COLUMN cycle_id INTEGER REFERENCES project_cycles (id) ON DELETE SET NULL;

CREATE INDEX idx_work_items_cycle ON work_items (cycle_id, status, updated_at DESC);
