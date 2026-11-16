-- 新建工作项草稿附件：file_attachments.target_type 增加 'draft'。
-- 草稿附件 target_id 为项目 id，归属者为 created_by_user_id；创建工作项时原地改绑为主帖评论附件。
-- SQLite 无法修改 CHECK 约束，按既有模式重建表；当前无其他表外键引用 file_attachments。

CREATE TABLE file_attachments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_object_id INTEGER NOT NULL REFERENCES file_objects (id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'work_item', 'comment', 'project_resource', 'draft')),
    target_id INTEGER NOT NULL,
    created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by_display_name_snapshot TEXT NOT NULL DEFAULT '',
    UNIQUE (file_object_id, target_type, target_id)
);

INSERT INTO file_attachments_new (
    id,
    file_object_id,
    target_type,
    target_id,
    created_by_user_id,
    created_at,
    created_by_display_name_snapshot
)
SELECT
    id,
    file_object_id,
    target_type,
    target_id,
    created_by_user_id,
    created_at,
    created_by_display_name_snapshot
FROM file_attachments;

-- 保留自增序列高水位，避免曾被删除的附件 id 被复用（正文按 id 引用附件）。
UPDATE sqlite_sequence
SET seq = MAX(
    seq,
    COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'file_attachments'), 0)
)
WHERE name = 'file_attachments_new';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'file_attachments_new', seq
FROM sqlite_sequence
WHERE name = 'file_attachments'
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'file_attachments_new');

DROP TABLE file_attachments;
ALTER TABLE file_attachments_new RENAME TO file_attachments;

CREATE INDEX idx_file_attachments_target ON file_attachments (target_type, target_id, created_at DESC);
