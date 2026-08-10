ALTER TABLE system_release_versions
ADD COLUMN channel TEXT NOT NULL DEFAULT 'legacy'
CHECK (channel IN ('legacy', 'internal'));

ALTER TABLE system_release_versions
ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed'));

ALTER TABLE system_release_versions
ADD COLUMN manifest_sha256 TEXT NOT NULL DEFAULT '';

ALTER TABLE system_release_versions
ADD COLUMN signing_key_id TEXT NOT NULL DEFAULT '';

ALTER TABLE system_release_versions
ADD COLUMN source_commit TEXT NOT NULL DEFAULT '';

ALTER TABLE system_release_versions
ADD COLUMN source_tag TEXT NOT NULL DEFAULT '';

ALTER TABLE system_release_versions
ADD COLUMN verified_at TEXT;

ALTER TABLE system_release_versions
ADD COLUMN withdrawn_at TEXT;

ALTER TABLE system_release_versions
ADD COLUMN withdrawal_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE system_release_versions
ADD COLUMN withdrawn_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE system_release_versions
ADD COLUMN github_withdrawal_status TEXT NOT NULL DEFAULT ''
CHECK (github_withdrawal_status IN ('', 'pending', 'succeeded', 'failed', 'not_required'));

CREATE INDEX idx_system_release_versions_channel_verification
ON system_release_versions (channel, verification_status, status, published_at DESC, id DESC);

CREATE INDEX idx_system_release_versions_withdrawn
ON system_release_versions (withdrawn_at, status, published_at DESC, id DESC);
