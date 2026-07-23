ALTER TABLE work_items
ADD COLUMN reporter_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resources
ADD COLUMN created_by_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resources
ADD COLUMN updated_by_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resources
ADD COLUMN archived_by_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE file_attachments
ADD COLUMN created_by_display_name_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE file_folders
ADD COLUMN created_by_display_name_snapshot TEXT NOT NULL DEFAULT '';
