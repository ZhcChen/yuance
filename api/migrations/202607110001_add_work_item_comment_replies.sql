ALTER TABLE work_item_comments
ADD COLUMN parent_comment_id INTEGER REFERENCES work_item_comments(id);

CREATE INDEX idx_work_item_comments_parent
ON work_item_comments(parent_comment_id, created_at, id);
