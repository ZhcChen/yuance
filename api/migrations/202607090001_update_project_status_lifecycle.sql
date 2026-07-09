-- no-transaction

PRAGMA foreign_keys = OFF;

CREATE TABLE projects_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'acceptance', 'completed', 'on_hold', 'cancelled', 'archived')),
    owner_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    start_date TEXT,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO projects_new (
    id,
    project_key,
    name,
    description,
    status,
    owner_user_id,
    start_date,
    due_date,
    created_at,
    updated_at
)
SELECT
    id,
    project_key,
    name,
    description,
    CASE status
        WHEN 'planning' THEN 'not_started'
        WHEN 'active' THEN 'in_progress'
        WHEN 'paused' THEN 'on_hold'
        WHEN 'archived' THEN 'archived'
        ELSE 'not_started'
    END,
    owner_user_id,
    start_date,
    due_date,
    created_at,
    updated_at
FROM projects;

DROP TABLE projects;

ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX idx_projects_status ON projects (status, updated_at DESC, id DESC);
CREATE INDEX idx_projects_owner ON projects (owner_user_id, status);

PRAGMA foreign_keys = ON;
