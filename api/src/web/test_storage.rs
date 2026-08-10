use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    domains::storage,
    platform::{
        crypto,
        error::{AppError, AppResult},
    },
    web::router::AppState,
};

#[derive(Debug, Deserialize)]
pub struct TestStorageUploadQuery {
    pub object_key: String,
    #[serde(default)]
    pub grant: String,
}

#[derive(Debug, Deserialize)]
pub struct TestStorageDownloadQuery {
    pub object_key: String,
    #[serde(default)]
    pub grant: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct TestStorageUploadGrant {
    object_key: String,
    user_id: i64,
    expires_at: i64,
}

#[derive(Debug, Deserialize, Serialize)]
struct TestStorageDownloadGrant {
    object_key: String,
    user_id: i64,
    expires_at: i64,
    content_type: String,
}

const TEST_STORAGE_UPLOAD_GRANT_AAD: &[u8] = b"yuance:test-storage-upload:v1";
const TEST_STORAGE_DOWNLOAD_GRANT_AAD: &[u8] = b"yuance:test-storage-download:v1";

pub fn bind_test_storage_upload_grant(
    state: &AppState,
    object_key: &str,
    user_id: i64,
    expires_in_seconds: u64,
    request: &mut storage::SignedObjectRequest,
) -> AppResult<()> {
    if !request.url.starts_with("/api/v1/test-storage/upload?") {
        return Ok(());
    }

    let expires_in_seconds = i64::try_from(expires_in_seconds)
        .map_err(|_| AppError::BadRequest("测试上传授权有效期无效".to_string()))?;
    let grant = TestStorageUploadGrant {
        object_key: object_key.to_string(),
        user_id,
        expires_at: Utc::now().timestamp() + expires_in_seconds,
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::BadRequest(format!("生成测试上传授权失败：{error}")))?;
    let encrypted_grant = crypto::encrypt_secret(
        &state.settings.security_master_key,
        &plaintext,
        TEST_STORAGE_UPLOAD_GRANT_AAD,
    )?;
    let query = serde_urlencoded::to_string([
        ("object_key", object_key),
        ("grant", encrypted_grant.as_str()),
    ])
    .map_err(|error| AppError::BadRequest(format!("生成测试上传地址失败：{error}")))?;
    request.url = format!("/api/v1/test-storage/upload?{query}");
    Ok(())
}

pub fn verify_test_storage_upload_grant(
    state: &AppState,
    query: &TestStorageUploadQuery,
) -> AppResult<()> {
    let plaintext = crypto::decrypt_secret(
        &state.settings.security_master_key,
        &query.grant,
        TEST_STORAGE_UPLOAD_GRANT_AAD,
    )
    .map_err(|_| AppError::Forbidden("测试对象存储上传授权无效或已过期".to_string()))?;
    let grant: TestStorageUploadGrant = serde_json::from_str(&plaintext)
        .map_err(|_| AppError::Forbidden("测试对象存储上传授权无效或已过期".to_string()))?;
    if grant.object_key != query.object_key
        || grant.user_id <= 0
        || grant.expires_at <= Utc::now().timestamp()
    {
        return Err(AppError::Forbidden(
            "测试对象存储上传授权无效或已过期".to_string(),
        ));
    }
    Ok(())
}

pub fn bind_test_storage_download_grant(
    state: &AppState,
    object_key: &str,
    content_type: &str,
    user_id: i64,
    expires_in_seconds: u64,
    request: &mut storage::SignedObjectRequest,
) -> AppResult<()> {
    if !request.url.starts_with("/api/v1/test-storage/download?") {
        return Ok(());
    }

    let expires_in_seconds = i64::try_from(expires_in_seconds)
        .map_err(|_| AppError::BadRequest("测试下载授权有效期无效".to_string()))?;
    let grant = TestStorageDownloadGrant {
        object_key: object_key.to_string(),
        user_id,
        expires_at: Utc::now().timestamp() + expires_in_seconds,
        content_type: content_type.to_string(),
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::BadRequest(format!("生成测试下载授权失败：{error}")))?;
    let encrypted_grant = crypto::encrypt_secret(
        &state.settings.security_master_key,
        &plaintext,
        TEST_STORAGE_DOWNLOAD_GRANT_AAD,
    )?;
    let query = serde_urlencoded::to_string([
        ("object_key", object_key),
        ("grant", encrypted_grant.as_str()),
    ])
    .map_err(|error| AppError::BadRequest(format!("生成测试下载地址失败：{error}")))?;
    request.url = format!("/api/v1/test-storage/download?{query}");
    Ok(())
}

pub fn verify_test_storage_download_grant(
    state: &AppState,
    query: &TestStorageDownloadQuery,
) -> AppResult<String> {
    let plaintext = crypto::decrypt_secret(
        &state.settings.security_master_key,
        &query.grant,
        TEST_STORAGE_DOWNLOAD_GRANT_AAD,
    )
    .map_err(|_| AppError::Forbidden("测试对象存储下载授权无效或已过期".to_string()))?;
    let grant: TestStorageDownloadGrant = serde_json::from_str(&plaintext)
        .map_err(|_| AppError::Forbidden("测试对象存储下载授权无效或已过期".to_string()))?;
    if grant.object_key != query.object_key
        || grant.user_id <= 0
        || grant.expires_at <= Utc::now().timestamp()
    {
        return Err(AppError::Forbidden(
            "测试对象存储下载授权无效或已过期".to_string(),
        ));
    }
    Ok(grant.content_type)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::web::router::AppState;

    #[test]
    fn expired_download_grant_is_rejected() {
        let state = AppState::for_tests();
        let grant = TestStorageDownloadGrant {
            object_key: "release/1/release-manifest.json".to_string(),
            user_id: 7,
            expires_at: Utc::now().timestamp() - 1,
            content_type: "application/json".to_string(),
        };
        let plaintext = serde_json::to_string(&grant).expect("grant should serialize");
        let encrypted = crypto::encrypt_secret(
            &state.settings.security_master_key,
            &plaintext,
            TEST_STORAGE_DOWNLOAD_GRANT_AAD,
        )
        .expect("grant should encrypt");
        let query = TestStorageDownloadQuery {
            object_key: grant.object_key,
            grant: encrypted,
        };
        assert!(verify_test_storage_download_grant(&state, &query).is_err());
    }

    #[test]
    fn download_grant_round_trip_binds_key_content_type_and_user() {
        let state = AppState::for_tests();
        let mut request = storage::SignedObjectRequest {
            method: "GET".to_string(),
            url: "/api/v1/test-storage/download?".to_string(),
            headers: Vec::new(),
        };
        bind_test_storage_download_grant(
            &state,
            "release/1/installer.dmg",
            "application/octet-stream",
            7,
            300,
            &mut request,
        )
        .expect("download grant should bind");
        let query = request
            .url
            .strip_prefix("/api/v1/test-storage/download?")
            .and_then(|value| serde_urlencoded::from_str::<TestStorageDownloadQuery>(value).ok())
            .expect("download query should parse");
        assert_eq!(
            verify_test_storage_download_grant(&state, &query)
                .expect("download grant should verify"),
            "application/octet-stream"
        );
    }
}
