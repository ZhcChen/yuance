ALTER TABLE work_items
ADD COLUMN deleted_at TEXT;

ALTER TABLE work_items
ADD COLUMN deleted_by_user_id INTEGER;

CREATE INDEX idx_work_items_deleted ON work_items (deleted_at, updated_at DESC, id DESC);
