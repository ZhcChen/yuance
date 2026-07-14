ALTER TABLE work_item_comments
ADD COLUMN actor_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE project_activities
ADD COLUMN actor_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE notifications
ADD COLUMN actor_display_name_snapshot TEXT NOT NULL DEFAULT '';
