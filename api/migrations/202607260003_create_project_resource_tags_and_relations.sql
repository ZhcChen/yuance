CREATE TABLE project_resource_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, normalized_name)
);

CREATE INDEX idx_project_resource_tags_project_name
    ON project_resource_tags (project_id, normalized_name, id DESC);

CREATE TABLE project_resource_tag_relations (
    resource_id INTEGER NOT NULL REFERENCES project_resources (id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES project_resource_tags (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (resource_id, tag_id)
);

CREATE INDEX idx_project_resource_tag_relations_tag
    ON project_resource_tag_relations (tag_id, resource_id);

CREATE TABLE project_resource_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL REFERENCES project_resources (id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (relation_type IN ('work_item', 'cycle')),
    related_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (resource_id, relation_type)
);

CREATE INDEX idx_project_resource_relations_related
    ON project_resource_relations (relation_type, related_id, resource_id);
