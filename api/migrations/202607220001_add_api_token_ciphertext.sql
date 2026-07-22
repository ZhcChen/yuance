ALTER TABLE api_tokens
ADD COLUMN token_ciphertext TEXT NOT NULL DEFAULT '';
