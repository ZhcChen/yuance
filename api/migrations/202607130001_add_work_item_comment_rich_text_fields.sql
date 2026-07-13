ALTER TABLE work_item_comments
ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain' CHECK (body_format IN ('plain', 'html'));

ALTER TABLE work_item_comments
ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0 CHECK (is_draft IN (0, 1));

CREATE INDEX idx_work_item_comments_item_draft
ON work_item_comments(work_item_id, is_draft, created_at, id);
