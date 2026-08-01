use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::platform::error::{AppError, AppResult};

pub const DEVICE_ACCESS_TOKEN_PREFIX: &str = "yuance_dat_";
pub const DEVICE_REFRESH_TOKEN_PREFIX: &str = "yuance_drt_";
pub const DEVICE_ACCESS_ISSUER: &str = "yuance-device-session";
pub const DEVICE_ACCESS_AUDIENCE: &str = "yuance-api";
pub const DEVICE_REFRESH_AUDIENCE: &str = "yuance-device-refresh";

const TOKEN_ENTROPY_BYTES: usize = 32;

pub fn issue_access_token() -> String {
    issue_token(DEVICE_ACCESS_TOKEN_PREFIX)
}

pub fn issue_refresh_token() -> String {
    issue_token(DEVICE_REFRESH_TOKEN_PREFIX)
}

pub fn is_device_access_token(value: &str) -> bool {
    valid_token_with_prefix(value, DEVICE_ACCESS_TOKEN_PREFIX)
}

pub fn is_device_refresh_token(value: &str) -> bool {
    valid_token_with_prefix(value, DEVICE_REFRESH_TOKEN_PREFIX)
}

pub fn hash_device_token(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

pub fn normalize_transaction_id(value: &str) -> AppResult<String> {
    let value = value.trim();
    let transaction_id = Uuid::parse_str(value)
        .map_err(|_| AppError::BadRequest("transaction_id 必须是有效 UUID".to_string()))?;
    Ok(transaction_id.hyphenated().to_string())
}

pub fn refresh_rotation_aad(
    family_id: &str,
    device_id: &str,
    server_instance_id: &str,
    source_generation: i64,
    transaction_id: &str,
    source_refresh_token_hash: &str,
) -> Vec<u8> {
    structured_aad(
        "device-refresh:v1",
        &[
            family_id,
            device_id,
            server_instance_id,
            &source_generation.to_string(),
            transaction_id,
            source_refresh_token_hash,
        ],
    )
}

pub fn exchange_result_aad(
    authorization_id: &str,
    server_instance_id: &str,
    transaction_id: &str,
    device_code_hash: &str,
) -> Vec<u8> {
    structured_aad(
        "device-exchange:v1",
        &[
            authorization_id,
            server_instance_id,
            transaction_id,
            device_code_hash,
        ],
    )
}

fn issue_token(prefix: &str) -> String {
    let mut entropy = [0_u8; TOKEN_ENTROPY_BYTES];
    OsRng.fill_bytes(&mut entropy);
    format!("{prefix}{}", URL_SAFE_NO_PAD.encode(entropy))
}

fn valid_token_with_prefix(value: &str, prefix: &str) -> bool {
    let Some(encoded) = value.strip_prefix(prefix) else {
        return false;
    };
    if encoded.len() != 43 {
        return false;
    }
    let Ok(decoded) = URL_SAFE_NO_PAD.decode(encoded) else {
        return false;
    };
    decoded.len() == TOKEN_ENTROPY_BYTES && URL_SAFE_NO_PAD.encode(decoded) == encoded
}

fn structured_aad(domain: &str, fields: &[&str]) -> Vec<u8> {
    let mut encoded = Vec::with_capacity(
        domain.len() + fields.iter().map(|field| field.len() + 4).sum::<usize>(),
    );
    encoded.extend_from_slice(domain.as_bytes());
    encoded.push(0);
    for field in fields {
        let bytes = field.as_bytes();
        let length = u32::try_from(bytes.len()).expect("AAD field length should fit u32");
        encoded.extend_from_slice(&length.to_be_bytes());
        encoded.extend_from_slice(bytes);
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_tokens_use_distinct_namespaces_and_full_entropy() {
        let access = issue_access_token();
        let refresh = issue_refresh_token();

        assert!(is_device_access_token(&access));
        assert!(!is_device_refresh_token(&access));
        assert!(is_device_refresh_token(&refresh));
        assert!(!is_device_access_token(&refresh));
        assert_ne!(access, issue_access_token());
        assert_ne!(refresh, issue_refresh_token());
    }

    #[test]
    fn token_validation_rejects_other_credential_types_and_bad_lengths() {
        for value in [
            "",
            "yuance_pat_example",
            "yuance_dat_short",
            "yuance_drt_short",
            "Bearer yuance_dat_example",
        ] {
            assert!(!is_device_access_token(value));
            assert!(!is_device_refresh_token(value));
        }
    }

    #[test]
    fn transaction_ids_are_canonicalized() {
        assert_eq!(
            normalize_transaction_id("550E8400-E29B-41D4-A716-446655440000")
                .expect("uuid should normalize"),
            "550e8400-e29b-41d4-a716-446655440000"
        );
        assert!(normalize_transaction_id("not-a-uuid").is_err());
    }

    #[test]
    fn rotation_aad_binds_every_recovery_dimension() {
        let baseline = refresh_rotation_aad("family", "device", "server", 3, "tx", "hash");
        for candidate in [
            refresh_rotation_aad("other", "device", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "other", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "device", "other", 3, "tx", "hash"),
            refresh_rotation_aad("family", "device", "server", 4, "tx", "hash"),
            refresh_rotation_aad("family", "device", "server", 3, "other", "hash"),
            refresh_rotation_aad("family", "device", "server", 3, "tx", "other"),
        ] {
            assert_ne!(baseline, candidate);
        }
    }

    #[test]
    fn structured_aad_does_not_confuse_delimiter_placements() {
        assert_ne!(
            refresh_rotation_aad("family:a", "device", "server", 3, "tx", "hash"),
            refresh_rotation_aad("family", "a:device", "server", 3, "tx", "hash")
        );
    }
}
