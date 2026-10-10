ALTER TABLE file_objects
ADD COLUMN upload_url_expires_at TEXT NOT NULL DEFAULT '';

-- Existing signed URLs are not recorded. Reserve the prior maximum TTL so deletes
-- remain delayed through the full in-flight PUT window after migration.
UPDATE file_objects
SET upload_url_expires_at = datetime('now', '+1 hour')
WHERE upload_url_expires_at = '';
