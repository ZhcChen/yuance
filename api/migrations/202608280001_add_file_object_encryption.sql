ALTER TABLE file_objects
ADD COLUMN encryption_status TEXT NOT NULL DEFAULT 'plain'
    CHECK (encryption_status IN ('plain', 'encrypted'));

ALTER TABLE file_objects
ADD COLUMN encryption_format TEXT NOT NULL DEFAULT '';

ALTER TABLE file_objects
ADD COLUMN encrypted_byte_size INTEGER NOT NULL DEFAULT 0
    CHECK (encrypted_byte_size >= 0);

ALTER TABLE file_objects
ADD COLUMN encrypted_checksum_sha256 TEXT NOT NULL DEFAULT '';

ALTER TABLE file_objects
ADD COLUMN data_key_envelope TEXT NOT NULL DEFAULT '';
