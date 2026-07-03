ALTER TABLE work_item_comments
ADD COLUMN deleted_at TEXT;

ALTER TABLE work_item_comments
ADD COLUMN deleted_by_user_id INTEGER;

CREATE INDEX idx_work_item_comments_deleted ON work_item_comments (deleted_at, updated_at DESC, id DESC);
