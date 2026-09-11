ALTER TABLE refresh_sessions
    ADD COLUMN rotated_session_token_ciphertext TEXT;

ALTER TABLE refresh_sessions
    ADD COLUMN rotated_refresh_token_ciphertext TEXT;

ALTER TABLE refresh_sessions
    ADD COLUMN rotation_recovery_expires_at TEXT;
