ALTER TABLE system_release_assets
ADD COLUMN architecture TEXT NOT NULL DEFAULT 'universal'
CHECK (architecture IN ('x64', 'arm64', 'universal'));

CREATE INDEX idx_system_release_assets_platform_architecture
ON system_release_assets (platform, architecture, created_at DESC, id DESC);
