CREATE TABLE user_project_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    current_project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_project_preferences_project ON user_project_preferences (current_project_id);
