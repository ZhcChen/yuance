ALTER TABLE system_release_assets
ADD COLUMN artifact_kind TEXT NOT NULL DEFAULT 'installer'
CHECK (artifact_kind IN ('installer', 'signature', 'sbom', 'manifest', 'checksums'));

CREATE INDEX idx_system_release_assets_release_kind
ON system_release_assets (release_id, artifact_kind, platform, architecture, id);
