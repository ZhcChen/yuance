DROP INDEX IF EXISTS idx_file_folders_unique_name;

CREATE UNIQUE INDEX idx_file_folders_unique_name
ON file_folders (project_id, COALESCE(parent_id, 0), name)
WHERE status = 'active';
