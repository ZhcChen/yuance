ALTER TABLE work_items
ADD COLUMN primary_post_comment_id INTEGER REFERENCES work_item_comments (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_work_items_primary_post_comment
ON work_items (primary_post_comment_id)
WHERE primary_post_comment_id IS NOT NULL;

CREATE TRIGGER work_items_primary_post_insert_guard
BEFORE INSERT ON work_items
WHEN NEW.primary_post_comment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM work_item_comments
    WHERE id = NEW.primary_post_comment_id
      AND work_item_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'primary post must belong to work item');
END;

CREATE TRIGGER work_items_primary_post_update_guard
BEFORE UPDATE OF primary_post_comment_id ON work_items
WHEN NEW.primary_post_comment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM work_item_comments
    WHERE id = NEW.primary_post_comment_id
      AND work_item_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'primary post must belong to work item');
END;
