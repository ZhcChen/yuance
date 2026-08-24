CREATE TABLE project_time_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    daily_hours REAL NOT NULL DEFAULT 8 CHECK (daily_hours > 0 AND daily_hours <= 24),
    note TEXT NOT NULL DEFAULT '',
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_time_allocations_user_dates
    ON project_time_allocations (user_id, start_date, end_date);
CREATE INDEX idx_time_allocations_project_dates
    ON project_time_allocations (project_id, start_date, end_date);
