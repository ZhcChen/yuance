CREATE TABLE project_resource_work_item_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    work_item_id INTEGER NOT NULL UNIQUE REFERENCES work_items (id) ON DELETE CASCADE,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_resource_work_item_links_project
    ON project_resource_work_item_links (project_id, created_at DESC, id DESC);

CREATE TRIGGER project_resource_work_item_links_insert_guard
BEFORE INSERT ON project_resource_work_item_links
WHEN NOT EXISTS (
    SELECT 1
    FROM work_items
    WHERE id = NEW.work_item_id
      AND project_id = NEW.project_id
)
BEGIN
    SELECT RAISE(ABORT, 'linked work item must belong to project');
END;

CREATE TRIGGER project_resource_work_item_links_update_guard
BEFORE UPDATE OF project_id, work_item_id ON project_resource_work_item_links
WHEN NOT EXISTS (
    SELECT 1
    FROM work_items
    WHERE id = NEW.work_item_id
      AND project_id = NEW.project_id
)
BEGIN
    SELECT RAISE(ABORT, 'linked work item must belong to project');
END;
