CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'paused', 'archived')),
    owner_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    start_date TEXT,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_status ON projects (status, updated_at DESC, id DESC);
CREATE INDEX idx_projects_owner ON projects (owner_user_id, status);

CREATE TABLE project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'maintainer', 'member', 'viewer')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members (project_id, member_role);
CREATE INDEX idx_project_members_user ON project_members (user_id, member_role);

CREATE TABLE work_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    item_key TEXT NOT NULL UNIQUE,
    item_type TEXT NOT NULL CHECK (item_type IN ('requirement', 'task', 'bug')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
    assignee_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    reporter_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    parent_work_item_id INTEGER REFERENCES work_items (id) ON DELETE SET NULL,
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_items_project_type_status ON work_items (project_id, item_type, status, updated_at DESC, id DESC);
CREATE INDEX idx_work_items_type_status ON work_items (item_type, status, updated_at DESC, id DESC);
CREATE INDEX idx_work_items_assignee ON work_items (assignee_user_id, status, updated_at DESC);
CREATE INDEX idx_work_items_parent ON work_items (parent_work_item_id);

CREATE TABLE work_item_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_item_id INTEGER NOT NULL REFERENCES work_items (id) ON DELETE CASCADE,
    author_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_item_comments_item ON work_item_comments (work_item_id, created_at DESC, id DESC);

CREATE TABLE project_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_key TEXT UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_activities_project ON project_activities (project_id, created_at DESC, id DESC);
CREATE INDEX idx_project_activities_actor ON project_activities (actor_user_id, created_at DESC);
