CREATE TABLE device_authorizations (
    id TEXT PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code_hash TEXT NOT NULL UNIQUE,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
    server_instance_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    client_version TEXT NOT NULL,
    authorization_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (authorization_status IN ('pending', 'approved', 'denied', 'expired', 'consumed')),
    approved_user_id INTEGER REFERENCES users (id) ON DELETE RESTRICT,
    exchange_transaction_id TEXT UNIQUE CHECK (
        exchange_transaction_id IS NULL
        OR (
            length(exchange_transaction_id) = 36
            AND substr(exchange_transaction_id, 9, 1) = '-'
            AND substr(exchange_transaction_id, 14, 1) = '-'
            AND substr(exchange_transaction_id, 19, 1) = '-'
            AND substr(exchange_transaction_id, 24, 1) = '-'
        )
    ),
    exchange_result_ciphertext TEXT NOT NULL DEFAULT '',
    exchange_result_expires_at TEXT,
    poll_interval_seconds INTEGER NOT NULL CHECK (poll_interval_seconds BETWEEN 2 AND 15),
    next_poll_at TEXT NOT NULL DEFAULT (datetime('now')),
    failed_user_code_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_user_code_attempts >= 0),
    expires_at TEXT NOT NULL,
    approved_at TEXT,
    denied_at TEXT,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (authorization_status IN ('approved', 'consumed'))
        = (approved_user_id IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CHECK ((authorization_status = 'denied') = (denied_at IS NOT NULL)),
    CHECK ((authorization_status = 'consumed') = (consumed_at IS NOT NULL)),
    CHECK (
        (exchange_result_ciphertext <> '')
        = (
            authorization_status = 'consumed'
            AND exchange_transaction_id IS NOT NULL
            AND exchange_result_expires_at IS NOT NULL
        )
    )
);

CREATE INDEX idx_device_authorizations_status_expiry
ON device_authorizations (authorization_status, expires_at);

CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    server_instance_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    client_version TEXT NOT NULL,
    device_status TEXT NOT NULL DEFAULT 'active'
        CHECK (device_status IN ('active', 'revoked')),
    authorization_version INTEGER NOT NULL DEFAULT 1 CHECK (authorization_version > 0),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    revoked_at TEXT,
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((device_status = 'revoked') = (revoked_at IS NOT NULL)),
    UNIQUE (user_id, server_instance_id, installation_id),
    UNIQUE (id, user_id, server_instance_id)
);

CREATE INDEX idx_devices_user_status ON devices (user_id, device_status);

CREATE TABLE device_credential_families (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    server_instance_id TEXT NOT NULL,
    family_status TEXT NOT NULL DEFAULT 'active'
        CHECK (family_status IN ('active', 'revoked', 'expired')),
    authorization_version INTEGER NOT NULL DEFAULT 1 CHECK (authorization_version > 0),
    refresh_sliding_expires_at TEXT NOT NULL,
    refresh_absolute_expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (refresh_absolute_expires_at >= refresh_sliding_expires_at),
    CHECK ((family_status = 'revoked') = (revoked_at IS NOT NULL)),
    UNIQUE (id, device_id, user_id, server_instance_id),
    FOREIGN KEY (device_id, user_id, server_instance_id)
        REFERENCES devices (id, user_id, server_instance_id) ON DELETE RESTRICT
);

CREATE INDEX idx_device_credential_families_user_status
ON device_credential_families (user_id, family_status);
CREATE INDEX idx_device_credential_families_device_status
ON device_credential_families (device_id, family_status);

CREATE TABLE device_access_sessions (
    id TEXT PRIMARY KEY,
    access_token_hash TEXT NOT NULL UNIQUE,
    family_id TEXT NOT NULL REFERENCES device_credential_families (id) ON DELETE RESTRICT,
    device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    server_instance_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 0),
    issuer TEXT NOT NULL CHECK (issuer = 'yuance-device-session'),
    audience TEXT NOT NULL CHECK (audience = 'yuance-api'),
    session_status TEXT NOT NULL DEFAULT 'active'
        CHECK (session_status IN ('active', 'revoked', 'expired')),
    authorization_version INTEGER NOT NULL CHECK (authorization_version > 0),
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT,
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((session_status = 'revoked') = (revoked_at IS NOT NULL)),
    UNIQUE (family_id, generation),
    FOREIGN KEY (family_id, device_id, user_id, server_instance_id)
        REFERENCES device_credential_families (id, device_id, user_id, server_instance_id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_device_access_sessions_family_status
ON device_access_sessions (family_id, session_status);
CREATE INDEX idx_device_access_sessions_user_status
ON device_access_sessions (user_id, session_status);

CREATE TABLE device_refresh_credentials (
    id TEXT PRIMARY KEY,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    family_id TEXT NOT NULL REFERENCES device_credential_families (id) ON DELETE RESTRICT,
    device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    server_instance_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 0),
    issuer TEXT NOT NULL CHECK (issuer = 'yuance-device-session'),
    audience TEXT NOT NULL CHECK (audience = 'yuance-device-refresh'),
    credential_status TEXT NOT NULL DEFAULT 'active'
        CHECK (credential_status IN ('active', 'rotated', 'revoked', 'expired')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    revoked_at TEXT,
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (credential_status = 'active' AND consumed_at IS NULL AND revoked_at IS NULL)
        OR (credential_status = 'rotated' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
        OR (credential_status = 'revoked' AND revoked_at IS NOT NULL)
        OR (credential_status = 'expired' AND consumed_at IS NULL AND revoked_at IS NULL)
    ),
    UNIQUE (family_id, generation),
    UNIQUE (
        family_id,
        generation,
        refresh_token_hash,
        device_id,
        user_id,
        server_instance_id
    ),
    FOREIGN KEY (family_id, device_id, user_id, server_instance_id)
        REFERENCES device_credential_families (id, device_id, user_id, server_instance_id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_device_refresh_credentials_family_status
ON device_refresh_credentials (family_id, credential_status);
CREATE UNIQUE INDEX idx_device_refresh_credentials_one_active_family
ON device_refresh_credentials (family_id)
WHERE credential_status = 'active';

CREATE TABLE device_refresh_rotations (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES device_credential_families (id) ON DELETE RESTRICT,
    device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    server_instance_id TEXT NOT NULL,
    source_generation INTEGER NOT NULL CHECK (source_generation >= 0),
    source_refresh_token_hash TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE CHECK (
        length(transaction_id) = 36
        AND substr(transaction_id, 9, 1) = '-'
        AND substr(transaction_id, 14, 1) = '-'
        AND substr(transaction_id, 19, 1) = '-'
        AND substr(transaction_id, 24, 1) = '-'
    ),
    rotation_status TEXT NOT NULL DEFAULT 'completed'
        CHECK (rotation_status IN ('completed', 'family_revoked')),
    result_ciphertext TEXT NOT NULL,
    result_expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (family_id, source_generation),
    FOREIGN KEY (
        family_id,
        source_generation,
        source_refresh_token_hash,
        device_id,
        user_id,
        server_instance_id
    ) REFERENCES device_refresh_credentials (
        family_id,
        generation,
        refresh_token_hash,
        device_id,
        user_id,
        server_instance_id
    ) ON DELETE RESTRICT,
    FOREIGN KEY (family_id, device_id, user_id, server_instance_id)
        REFERENCES device_credential_families (id, device_id, user_id, server_instance_id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_device_refresh_rotations_expiry
ON device_refresh_rotations (result_expires_at);
