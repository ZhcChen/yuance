use std::{
    collections::HashMap,
    fs,
    io::Write,
    process::{Command, Output, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use axum::{
    Router,
    body::Bytes,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method, StatusCode},
    response::IntoResponse,
    routing::{any, get, post, put},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use futures_util::StreamExt;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use yuance_agent::file_crypto::{EncryptedFileStream, hash_file};

#[derive(Clone, Debug)]
struct CapturedRequest {
    method: Method,
    uri: String,
    headers: HeaderMap,
    body: Value,
}

type Requests = Arc<Mutex<Vec<CapturedRequest>>>;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resource_attachment_upload_runs_the_complete_plain_file_flow() {
    let file = std::env::temp_dir().join(format!("yuance-agent-upload-{}.svg", std::process::id()));
    let contents = b"<svg/>";
    fs::write(&file, contents).unwrap();
    let app = Router::new()
        .route(
            "/api/v1/projects/YCE/resources/7/attachments",
            post(|| async {
                axum::Json(json!({"data": {"id": 8}}))
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/8/upload-url",
            get(|| async {
                axum::Json(json!({
                    "data": {
                        "attachment": {"id": 8, "file_object_id": 9, "filename": "upload.svg", "content_type": "image/svg+xml", "byte_size": 6, "status": "pending"},
                        "request": {"method": "PUT", "url": "/signed-upload", "headers": {"content-length": "6", "content-type": "image/svg+xml"}},
                        "expires_in_seconds": 60,
                        "expires_at": (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339(),
                        "checksum_sha256": "d4dc56669143034f31aa309635d4113d9ad76a02b1739da22c965ed2049be9e6",
                        "encryption": null
                    }
                }))
            }),
        )
        .route(
            "/signed-upload",
            put(move |body: Bytes| async move {
                assert_eq!(body.as_ref(), contents);
                StatusCode::NO_CONTENT
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/8/uploaded",
            post(|| async { axum::Json(json!({"data": {"id": 8, "status": "uploaded"}})) }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let output = command_output(
        &format!("http://{address}"),
        &[
            "resources",
            "attachments",
            "upload",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--file",
            file.to_str().unwrap(),
        ],
        None,
    );
    fs::remove_file(&file).unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let payload: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(payload["data"]["status"], "uploaded");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resource_attachment_download_decrypts_and_keeps_secrets_inside_the_cli() {
    let plaintext = [vec![b'a'; 1024 * 1024], b"attachment".to_vec()].concat();
    let key = [19_u8; 32];
    let ciphertext = encrypt_fixture(&plaintext, key, 9).await;
    let empty_ciphertext = encrypt_fixture(&[], key, 15).await;
    let encrypted_without_plaintext_checksum =
        b"encrypted attachment without registered plaintext digest";
    let encrypted_without_plaintext_checksum_ciphertext =
        encrypt_fixture(encrypted_without_plaintext_checksum, key, 17).await;
    let mut invalid_header_ciphertext = encrypted_without_plaintext_checksum_ciphertext.clone();
    invalid_header_ciphertext[29] ^= 1;
    let plain_sha256 = hex::encode(Sha256::digest(&plaintext));
    let empty_sha256 = hex::encode(Sha256::digest([]));
    let encrypted_sha256 = hex::encode(Sha256::digest(&ciphertext));
    let empty_encrypted_sha256 = hex::encode(Sha256::digest(&empty_ciphertext));
    let encrypted_without_plaintext_checksum_sha256 = hex::encode(Sha256::digest(
        &encrypted_without_plaintext_checksum_ciphertext,
    ));
    let invalid_header_encrypted_sha256 = hex::encode(Sha256::digest(&invalid_header_ciphertext));
    let mut encrypted_response = signed_download_response(DownloadResponse {
        attachment_id: 8,
        file_object_id: 9,
        filename: "guide.pdf",
        content_type: "application/pdf",
        byte_size: plaintext.len() as i64,
        checksum_sha256: &plain_sha256,
        encryption: json!({
            "algorithm": "AES-256-GCM",
            "format": "YUANCE-ENC-v1",
            "chunk_size": 1048576,
            "key": BASE64.encode(key),
            "file_object_id": 9,
            "plaintext_byte_size": plaintext.len(),
            "plaintext_sha256": plain_sha256,
            "encrypted_byte_size": ciphertext.len(),
            "encrypted_checksum_sha256": encrypted_sha256
        }),
        url: "/signed-encrypted?sig=download-secret",
    });
    encrypted_response["data"]["unrecognized_secret"] = json!("future-secret");
    encrypted_response["data"]["request"]["future_header"] = json!("future-header-secret");
    let typed_response =
        serde_json::from_value::<yuance_agent::models::AttachmentSignedUrlEnvelope>(
            encrypted_response.clone(),
        )
        .unwrap();
    let debug = format!("{typed_response:?}");
    assert!(!debug.contains(&BASE64.encode(key)));
    assert!(!debug.contains("download-secret"));
    let mut invalid_checksum_response = encrypted_response.clone();
    invalid_checksum_response["data"]["encryption"]["encrypted_checksum_sha256"] =
        json!("0".repeat(64));
    let mut invalid_aead_ciphertext = ciphertext.clone();
    *invalid_aead_ciphertext.last_mut().unwrap() ^= 1;
    let invalid_aead_sha256 = hex::encode(Sha256::digest(&invalid_aead_ciphertext));
    let mut invalid_aead_response = encrypted_response.clone();
    invalid_aead_response["data"]["attachment"]["id"] = json!(14);
    invalid_aead_response["data"]["request"]["url"] = json!("/signed-invalid-aead");
    invalid_aead_response["data"]["encryption"]["encrypted_checksum_sha256"] =
        json!(invalid_aead_sha256);
    let empty_encrypted_response = signed_download_response(DownloadResponse {
        attachment_id: 15,
        file_object_id: 16,
        filename: "empty.txt",
        content_type: "text/plain",
        byte_size: 0,
        checksum_sha256: &empty_sha256,
        encryption: json!({
            "algorithm": "AES-256-GCM",
            "format": "YUANCE-ENC-v1",
            "chunk_size": 1048576,
            "key": BASE64.encode(key),
            "file_object_id": 16,
            "plaintext_byte_size": 0,
            "plaintext_sha256": empty_sha256,
            "encrypted_byte_size": empty_ciphertext.len(),
            "encrypted_checksum_sha256": empty_encrypted_sha256
        }),
        url: "/signed-empty-encrypted",
    });
    let encrypted_without_plaintext_checksum_response =
        signed_download_response(DownloadResponse {
            attachment_id: 16,
            file_object_id: 17,
            filename: "encrypted-without-registered-digest.txt",
            content_type: "text/plain",
            byte_size: encrypted_without_plaintext_checksum.len() as i64,
            checksum_sha256: "",
            encryption: json!({
                "algorithm": "AES-256-GCM",
                "format": "YUANCE-ENC-v1",
                "chunk_size": 1048576,
                "key": BASE64.encode(key),
                "file_object_id": 17,
                "plaintext_byte_size": encrypted_without_plaintext_checksum.len(),
                "plaintext_sha256": "",
                "encrypted_byte_size": encrypted_without_plaintext_checksum_ciphertext.len(),
                "encrypted_checksum_sha256": encrypted_without_plaintext_checksum_sha256
            }),
            url: "/signed-encrypted-no-plaintext-digest",
        });
    let invalid_header_response = signed_download_response(DownloadResponse {
        attachment_id: 17,
        file_object_id: 17,
        filename: "encrypted-with-invalid-header-digest.txt",
        content_type: "text/plain",
        byte_size: encrypted_without_plaintext_checksum.len() as i64,
        checksum_sha256: "",
        encryption: json!({
            "algorithm": "AES-256-GCM",
            "format": "YUANCE-ENC-v1",
            "chunk_size": 1048576,
            "key": BASE64.encode(key),
            "file_object_id": 17,
            "plaintext_byte_size": encrypted_without_plaintext_checksum.len(),
            "plaintext_sha256": "",
            "encrypted_byte_size": invalid_header_ciphertext.len(),
            "encrypted_checksum_sha256": invalid_header_encrypted_sha256
        }),
        url: "/signed-invalid-header-digest",
    });
    let plain = b"historical plain attachment".to_vec();
    let plain_sha = hex::encode(Sha256::digest(&plain));
    let plain_response = signed_download_response(DownloadResponse {
        attachment_id: 9,
        file_object_id: 10,
        filename: "legacy.txt",
        content_type: "text/plain",
        byte_size: plain.len() as i64,
        checksum_sha256: &plain_sha,
        encryption: Value::Null,
        url: "/signed-plain?sig=plain-secret",
    });
    let legacy_without_checksum = signed_download_response(DownloadResponse {
        attachment_id: 13,
        file_object_id: 14,
        filename: "legacy-without-checksum.txt",
        content_type: "text/plain",
        byte_size: plain.len() as i64,
        checksum_sha256: "",
        encryption: Value::Null,
        url: "/signed-legacy-no-checksum?sig=legacy-secret",
    });
    let app = Router::new()
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/8/download-url",
            get({
                let response = encrypted_response.clone();
                move |headers: HeaderMap| async move {
                    assert_eq!(
                        headers.get("authorization").unwrap(),
                        "Bearer yuance_pat_test"
                    );
                    axum::Json(response)
                }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/9/download-url",
            get({
                let response = plain_response.clone();
                move |headers: HeaderMap| async move {
                    assert_eq!(
                        headers.get("authorization").unwrap(),
                        "Bearer yuance_pat_test"
                    );
                    axum::Json(response)
                }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/10/download-url",
            get({
                let response = invalid_checksum_response.clone();
                move |headers: HeaderMap| async move {
                    assert_eq!(
                        headers.get("authorization").unwrap(),
                        "Bearer yuance_pat_test"
                    );
                    axum::Json(response)
                }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/11/download-url",
            get({
                let response = plain_response.clone();
                move |headers: HeaderMap, OriginalUri(uri): OriginalUri| async move {
                    assert_eq!(
                        headers.get("authorization").unwrap(),
                        "Bearer yuance_pat_test"
                    );
                    let query = reqwest::Url::parse(&format!("http://localhost{}", uri))
                        .unwrap()
                        .query_pairs()
                        .find(|(name, _)| name == "access")
                        .map(|(_, value)| value.into_owned());
                    assert_eq!(query.as_deref(), Some("short-lived-resource-token"));
                    axum::Json(response)
                }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/13/download-url",
            get({
                let response = legacy_without_checksum.clone();
                move || async move { axum::Json(response) }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/14/download-url",
            get({
                let response = invalid_aead_response.clone();
                move || async move { axum::Json(response) }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/15/download-url",
            get({
                let response = empty_encrypted_response.clone();
                move || async move { axum::Json(response) }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/16/download-url",
            get({
                let response = encrypted_without_plaintext_checksum_response.clone();
                move || async move { axum::Json(response) }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/17/download-url",
            get({
                let response = invalid_header_response.clone();
                move || async move { axum::Json(response) }
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/12/upload-url",
            get(|| async {
                axum::Json(json!({
                    "data": {
                        "attachment": {"id": 12, "file_object_id": 13, "filename": "new.txt", "content_type": "text/plain", "byte_size": 4, "status": "pending"},
                        "request": {"method": "PUT", "url": "/signed-upload?sig=upload-secret", "headers": {"x-oss-signature": "upload-header-secret"}},
                        "expires_in_seconds": 60,
                        "expires_at": (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339(),
                        "checksum_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        "encryption": {"algorithm": "AES-256-GCM", "format": "YUANCE-ENC-v1", "chunk_size": 1048576, "key": BASE64.encode([19_u8; 32]), "file_object_id": 13, "plaintext_byte_size": 4, "plaintext_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "encrypted_byte_size": 97, "encrypted_checksum_sha256": ""}
                    }
                }))
            }),
        )
        .route(
            "/api/v1/projects/YCE/resources/7/attachments/18/download-url",
            get(|| async {
                axum::Json(json!({
                    "data": {
                        "attachment": {},
                        "request": {"method": "method-secret", "url": "/signed-secret", "headers": {}},
                        "expires_in_seconds": 60,
                        "expires_at": (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339(),
                        "checksum_sha256": "",
                        "encryption": null
                    }
                }))
            }),
        )
        .route(
            "/signed-encrypted",
            get({
                let ciphertext = ciphertext.clone();
                move |headers: HeaderMap| async move {
                    assert!(headers.get("authorization").is_none());
                    assert!(headers.get("cookie").is_none());
                    (
                        [("content-type", "application/octet-stream")],
                        Bytes::from(ciphertext),
                    )
                }
            }),
        )
        .route(
            "/signed-plain",
            get({
                let plain = plain.clone();
                move |headers: HeaderMap, OriginalUri(uri): OriginalUri| async move {
                    assert!(headers.get("authorization").is_none());
                    assert!(headers.get("cookie").is_none());
                    assert_eq!(
                        reqwest::Url::parse(&format!("http://localhost{}", uri))
                            .unwrap()
                            .query(),
                        Some("sig=plain-secret")
                    );
                    ([("content-type", "text/plain")], Bytes::from(plain))
                }
            }),
        )
        .route(
            "/signed-legacy-no-checksum",
            get({
                let plain = plain.clone();
                move || async move {
                    ([ ("content-type", "text/plain") ], Bytes::from(plain))
                }
            }),
        )
        .route(
            "/signed-invalid-aead",
            get({
                move || async move {
                    (
                        [("content-type", "application/octet-stream")],
                        Bytes::from(invalid_aead_ciphertext),
                    )
                }
            }),
        )
        .route(
            "/signed-empty-encrypted",
            get({
                let ciphertext = empty_ciphertext.clone();
                move || async move {
                    (
                        [("content-type", "application/octet-stream")],
                        Bytes::from(ciphertext),
                    )
                }
            }),
        )
        .route(
            "/signed-encrypted-no-plaintext-digest",
            get({
                let ciphertext = encrypted_without_plaintext_checksum_ciphertext.clone();
                move || async move {
                    (
                        [("content-type", "application/octet-stream")],
                        Bytes::from(ciphertext),
                    )
                }
            }),
        )
        .route(
            "/signed-invalid-header-digest",
            get({
                let ciphertext = invalid_header_ciphertext.clone();
                move || async move {
                    (
                        [("content-type", "application/octet-stream")],
                        Bytes::from(ciphertext),
                    )
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base_url = format!("http://{address}");
    let encrypted_output = download_path("encrypted");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "8",
            "--output",
            encrypted_output.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    assert_eq!(fs::read(&encrypted_output).unwrap(), plaintext);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&encrypted_output)
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(!stdout.contains(&BASE64.encode(key)));
    assert!(!stdout.contains("download-secret"));
    assert!(!stdout.contains("future-secret"));
    assert!(!stdout.contains("future-header-secret"));
    assert!(serde_json::from_str::<Value>(&stdout).unwrap()["data"]["status"] == "downloaded");
    fs::remove_file(&encrypted_output).unwrap();

    let plain_output = download_path("plain");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "9",
            "--output",
            plain_output.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(fs::read(&plain_output).unwrap(), plain);
    fs::remove_file(&plain_output).unwrap();

    let legacy_output = download_path("legacy-without-checksum");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "13",
            "--output",
            legacy_output.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let legacy_payload: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(legacy_payload["data"]["sha256"], plain_sha);
    assert_eq!(fs::read(&legacy_output).unwrap(), plain);
    fs::remove_file(&legacy_output).unwrap();

    let protected_output = download_path("protected");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "11",
            "--output",
            protected_output.to_str().unwrap(),
            "--access-token-stdin",
        ],
        Some("short-lived-resource-token"),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(!stdout.contains("short-lived-resource-token"));
    assert_eq!(fs::read(&protected_output).unwrap(), plain);
    fs::remove_file(&protected_output).unwrap();

    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download-url",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "10",
        ],
        None,
    );
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(!stdout.contains(&BASE64.encode(key)));
    assert!(!stdout.contains("download-secret"));
    let diagnostic: Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(diagnostic["data"]["request"]["url"], "[redacted]");
    assert_eq!(diagnostic["data"]["encryption"]["key"], "[redacted]");

    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download-url",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "18",
        ],
        None,
    );
    assert!(output.status.success());
    let diagnostic: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(diagnostic["data"]["request"]["method"].is_null());
    assert!(
        !output
            .stdout
            .windows(b"method-secret".len())
            .any(|window| window == b"method-secret")
    );
    assert!(diagnostic["data"]["attachment"].is_object());
    assert!(diagnostic["data"].get("unrecognized_secret").is_none());
    assert!(diagnostic["data"]["request"].get("future_header").is_none());

    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "upload-url",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "12",
        ],
        None,
    );
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(!stdout.contains(&BASE64.encode(key)));
    assert!(!stdout.contains("upload-secret"));
    assert!(!stdout.contains("upload-header-secret"));
    let diagnostic: Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(diagnostic["data"]["request"]["method"], "PUT");
    assert_eq!(diagnostic["data"]["request"]["url"], "[redacted]");
    assert_eq!(diagnostic["data"]["encryption"]["key"], "[redacted]");

    let invalid_output = download_path("invalid");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "10",
            "--output",
            invalid_output.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(26));
    assert_eq!(
        json_stderr(&output)["error"]["code"],
        "encrypted_checksum_mismatch"
    );
    assert!(!invalid_output.exists());

    let invalid_aead_output = download_path("invalid-aead");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "14",
            "--output",
            invalid_aead_output.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(26));
    assert_eq!(json_stderr(&output)["error"]["code"], "decryption_failed");
    assert!(!invalid_aead_output.exists());

    let empty_output = download_path("empty-encrypted");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "15",
            "--output",
            empty_output.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(fs::read(&empty_output).unwrap().is_empty());
    fs::remove_file(empty_output).unwrap();

    let legacy_encrypted_output = download_path("encrypted-without-registered-digest");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "16",
            "--output",
            legacy_encrypted_output.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let payload: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        payload["data"]["sha256"],
        hex::encode(Sha256::digest(encrypted_without_plaintext_checksum))
    );
    assert_eq!(
        fs::read(&legacy_encrypted_output).unwrap(),
        encrypted_without_plaintext_checksum
    );
    fs::remove_file(legacy_encrypted_output).unwrap();

    let invalid_header_output = download_path("invalid-header-digest");
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "17",
            "--output",
            invalid_header_output.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(26));
    assert_eq!(json_stderr(&output)["error"]["code"], "decryption_failed");
    assert!(!invalid_header_output.exists());
}

#[tokio::test]
async fn resource_attachment_download_refuses_to_overwrite_existing_output() {
    let (base_url, requests) = server().await;
    let output_path = download_path("existing");
    fs::write(&output_path, b"keep me").unwrap();
    let output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "download",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "8",
            "--output",
            output_path.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(26));
    assert_eq!(
        json_stderr(&output)["error"]["code"],
        "output_already_exists"
    );
    assert!(requests.lock().unwrap().is_empty());
    assert_eq!(fs::read(&output_path).unwrap(), b"keep me");
    fs::remove_file(output_path).unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn project_commands_encode_queries_and_path_segments() {
    let (base_url, requests) = server().await;

    run(&base_url, &["projects", "list"]);
    run(
        &base_url,
        &[
            "projects",
            "list",
            "--status",
            "active now",
            "--page",
            "2",
            "--per-page",
            "40",
        ],
    );
    run(&base_url, &["projects", "get", "YCE/研发 ?"]);

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::GET, "/api/v1/projects");
    assert_eq!(requests[0].uri, "/api/v1/projects");
    assert_eq!(
        query(&requests[1].uri),
        HashMap::from([
            ("status".to_string(), "active now".to_string()),
            ("page".to_string(), "2".to_string()),
            ("per_page".to_string(), "40".to_string()),
        ])
    );
    assert_eq!(
        requests[2].uri,
        "/api/v1/projects/YCE%2F%E7%A0%94%E5%8F%91%20%3F"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn work_item_list_and_get_preserve_explicit_filters_and_keys() {
    let (base_url, requests) = server().await;
    run(&base_url, &["work-items", "list"]);
    run(
        &base_url,
        &[
            "work-items",
            "list",
            "--item-type",
            "bug",
            "--project-key",
            "YCE A",
            "--q",
            "登录 & 权限",
            "--status",
            "in_progress",
            "--priority",
            "P1",
            "--assignee-username",
            "alice+bob",
        ],
    );
    run(&base_url, &["work-items", "get", "YCE/BUG?#1"]);

    let requests = requests.lock().unwrap();
    assert_eq!(requests[0].uri, "/api/v1/work-items");
    let query = query(&requests[1].uri);
    assert_eq!(query["item_type"], "bug");
    assert_eq!(query["project_key"], "YCE A");
    assert_eq!(query["q"], "登录 & 权限");
    assert_eq!(query["status"], "in_progress");
    assert_eq!(query["priority"], "P1");
    assert_eq!(query["assignee_username"], "alice+bob");
    assert_eq!(requests[2].uri, "/api/v1/work-items/YCE%2FBUG%3F%231");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn create_supports_all_item_types_and_explicit_payloads() {
    let (base_url, requests) = server().await;
    for item_type in ["requirement", "task", "bug"] {
        run(
            &base_url,
            &[
                "work-items",
                "create",
                "--project-key",
                "YCE",
                "--item-type",
                item_type,
                "--title",
                "契约测试",
                "--description",
                "正文",
                "--priority",
                "P2",
                "--assignee-username",
                "alice",
                "--due-date",
                "2026-08-01",
                "--parent-item-key",
                "YCE-REQ-1",
            ],
        );
    }

    let requests = requests.lock().unwrap();
    for (request, item_type) in requests.iter().zip(["requirement", "task", "bug"]) {
        assert_request(request, Method::POST, "/api/v1/work-items");
        assert_json_content_type(request);
        assert_eq!(request.body["item_type"], item_type);
        assert_eq!(request.body["project_key"], "YCE");
        assert_eq!(request.body["title"], "契约测试");
        assert_eq!(request.body["priority"], "P2");
        assert_eq!(request.body["assignee_username"], "alice");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn update_only_sends_explicit_metadata_and_handoff_owns_flow_fields() {
    let (base_url, requests) = server().await;
    run(
        &base_url,
        &[
            "work-items",
            "update",
            "YCE-TASK-1",
            "--title",
            "新标题",
            "--priority",
            "P0",
        ],
    );
    run(
        &base_url,
        &[
            "work-items",
            "handoff",
            "YCE-TASK-1",
            "--status",
            "in_progress",
            "--assignee-username",
            "bob",
            "--body",
            "开始处理",
            "--source-comment-id",
            "123",
        ],
    );

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::PATCH, "/api/v1/work-items/YCE-TASK-1");
    assert_eq!(
        requests[0].body,
        json!({"title": "新标题", "priority": "P0"})
    );
    assert!(requests[0].body.get("status").is_none());
    assert!(requests[0].body.get("assignee_username").is_none());
    assert_json_content_type(&requests[0]);

    assert_request(
        &requests[1],
        Method::POST,
        "/api/v1/work-items/YCE-TASK-1/handoff",
    );
    assert_eq!(
        requests[1].body,
        json!({
            "status": "in_progress",
            "assignee_username": "bob",
            "body": "开始处理",
            "source_comment_id": 123
        })
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn comments_distinguish_top_level_and_reply() {
    let (base_url, requests) = server().await;
    run(&base_url, &["comments", "list", "YCE-BUG-2"]);
    run(
        &base_url,
        &["comments", "create", "YCE-BUG-2", "--body", "顶层评论"],
    );
    run(
        &base_url,
        &[
            "comments",
            "create",
            "YCE-BUG-2",
            "--body",
            "回复",
            "--body-format",
            "plain",
            "--parent-comment-id",
            "42",
        ],
    );

    let requests = requests.lock().unwrap();
    assert_request(
        &requests[0],
        Method::GET,
        "/api/v1/work-items/YCE-BUG-2/comments",
    );
    assert_eq!(
        requests[1].body,
        json!({"body": "顶层评论", "body_format": "html"})
    );
    assert_eq!(
        requests[2].body,
        json!({"body": "回复", "body_format": "plain", "parent_comment_id": 42})
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resource_and_notification_commands_use_fixed_api_paths() {
    let (base_url, requests) = server().await;
    run(&base_url, &["whoami"]);
    run(
        &base_url,
        &["resources", "list", "--project-key", "YCE", "--tag", "接口"],
    );
    run(
        &base_url,
        &[
            "resources",
            "get",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
        ],
    );
    run(
        &base_url,
        &[
            "resources",
            "attachments",
            "create",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--original-filename",
            "guide.pdf",
            "--content-type",
            "application/pdf",
            "--byte-size",
            "12",
        ],
    );
    let upload_url_output = command_output(
        &base_url,
        &[
            "resources",
            "attachments",
            "upload-url",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "8",
        ],
        None,
    );
    assert!(upload_url_output.status.success());
    let redacted: Value = serde_json::from_slice(&upload_url_output.stdout).unwrap();
    assert_eq!(redacted["data"]["request"]["url"], "[redacted]");
    assert_eq!(redacted["data"]["request"]["headers"], json!({}));
    run(
        &base_url,
        &[
            "resources",
            "attachments",
            "complete",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "8",
            "--encrypted-sha256",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
    );
    run(
        &base_url,
        &[
            "resources",
            "attachments",
            "delete",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--attachment-id",
            "8",
            "--if-match",
            "v1",
        ],
    );
    run(
        &base_url,
        &["notifications", "list", "--filter", "unread", "--page", "2"],
    );

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::GET, "/api/v1/auth/me");
    assert_eq!(query(&requests[1].uri)["tag"], "接口");
    assert_eq!(requests[2].uri, "/api/v1/projects/YCE/resources/7");
    assert_request(
        &requests[3],
        Method::POST,
        "/api/v1/projects/YCE/resources/7/attachments",
    );
    assert_eq!(requests[3].body["original_filename"], "guide.pdf");
    assert_request(
        &requests[4],
        Method::GET,
        "/api/v1/projects/YCE/resources/7/attachments/8/upload-url",
    );
    assert_request(
        &requests[5],
        Method::POST,
        "/api/v1/projects/YCE/resources/7/attachments/8/uploaded",
    );
    assert_eq!(
        requests[5].body["encrypted_sha256"],
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    assert_eq!(requests[6].headers.get("if-match").unwrap(), "v1");
    assert_eq!(query(&requests[7].uri)["filter"], "unread");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resource_create_reads_body_file_and_password_from_stdin() {
    let (base_url, requests) = server().await;
    let path = std::env::temp_dir().join(format!(
        "yuance-agent-resource-{}-{}.html",
        std::process::id(),
        Arc::as_ptr(&requests) as usize
    ));
    fs::write(&path, "<h2>待确认规则</h2><p>正文</p>").unwrap();
    run_with_stdin(
        &base_url,
        &[
            "resources",
            "create",
            "--project-key",
            "YCE",
            "--title",
            "供应链售后规则",
            "--category",
            "other",
            "--body-file",
            path.to_str().unwrap(),
            "--body-format",
            "html",
            "--access-password-stdin",
            "--tags",
            "供应链",
            "售后",
            "--related-work-item-key",
            "YCE-REQ-1",
            "--related-cycle-id",
            "7",
        ],
        "safe-pass",
    );
    fs::remove_file(path).unwrap();

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::POST, "/api/v1/projects/YCE/resources");
    assert_eq!(
        requests[0].body,
        json!({
            "title": "供应链售后规则",
            "category": "other",
            "body": "<h2>待确认规则</h2><p>正文</p>",
            "body_format": "html",
            "access_password": "safe-pass",
            "tags": ["供应链", "售后"],
            "related_work_item_key": "YCE-REQ-1",
            "related_cycle_id": 7
        })
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn long_body_reads_file_and_stdin() {
    let (base_url, requests) = server().await;
    let path = std::env::temp_dir().join(format!(
        "yuance-agent-description-{}-{}.txt",
        std::process::id(),
        Arc::as_ptr(&requests) as usize
    ));
    fs::write(&path, "文件描述\n第二行").unwrap();
    run(
        &base_url,
        &[
            "work-items",
            "create",
            "--project-key",
            "YCE",
            "--item-type",
            "task",
            "--title",
            "文件输入",
            "--description-file",
            path.to_str().unwrap(),
        ],
    );
    run_with_stdin(
        &base_url,
        &["comments", "create", "YCE-TASK-1", "--body-file", "-"],
        "stdin 评论\n第二行",
    );
    fs::remove_file(path).unwrap();

    let requests = requests.lock().unwrap();
    assert_eq!(requests[0].body["description"], "文件描述\n第二行");
    assert_eq!(requests[1].body["body"], "stdin 评论\n第二行");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalid_local_input_does_not_send_requests() {
    let (base_url, requests) = server().await;
    let output = command_output(&base_url, &["work-items", "update", "YCE-TASK-1"], None);
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(
        json_stderr(&output)["error"]["code"],
        "missing_update_fields"
    );

    let output = command_output(
        &base_url,
        &["comments", "create", "YCE-TASK-1", "--body", "  "],
        None,
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(json_stderr(&output)["error"]["code"], "empty_input");

    let output = command_output(&base_url, &["work-items", "list", "--page", "0"], None);
    assert_eq!(output.status.code(), Some(2));

    let output = command_output(
        &base_url,
        &[
            "resources",
            "create",
            "--project-key",
            "YCE",
            "--title",
            "资料",
            "--body-file",
            "-",
            "--access-password-stdin",
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(
        json_stderr(&output)["error"]["code"],
        "conflicting_stdin_inputs"
    );
    assert!(requests.lock().unwrap().is_empty());
}

fn run(base_url: &str, args: &[&str]) {
    let output = command_output(base_url, args, None);
    assert!(
        output.status.success(),
        "command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        json!({"data": {"ok": true}})
    );
}

fn run_with_stdin(base_url: &str, args: &[&str], stdin: &str) {
    let output = command_output(base_url, args, Some(stdin));
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn command_output(base_url: &str, args: &[&str], stdin: Option<&str>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_yuance-agent"));
    command
        .args(args)
        .env("YUANCE_BASE_URL", base_url)
        .env("YUANCE_API_TOKEN", "yuance_pat_test")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if stdin.is_some() {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().unwrap();
    if let Some(stdin) = stdin {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(stdin.as_bytes())
            .unwrap();
    }
    child.wait_with_output().unwrap()
}

async fn encrypt_fixture(plaintext: &[u8], key: [u8; 32], file_object_id: i64) -> Vec<u8> {
    let source = std::env::temp_dir().join(format!(
        "yuance-agent-download-source-{}.bin",
        std::process::id()
    ));
    fs::write(&source, plaintext).unwrap();
    let digest = hash_file(&source).unwrap();
    let mut stream =
        EncryptedFileStream::open(source.clone(), file_object_id, key, &digest).unwrap();
    let mut ciphertext = Vec::new();
    while let Some(chunk) = stream.next().await {
        ciphertext.extend_from_slice(&chunk.unwrap());
    }
    fs::remove_file(source).unwrap();
    ciphertext
}

struct DownloadResponse<'a> {
    attachment_id: i64,
    file_object_id: i64,
    filename: &'a str,
    content_type: &'a str,
    byte_size: i64,
    checksum_sha256: &'a str,
    encryption: Value,
    url: &'a str,
}

fn signed_download_response(response: DownloadResponse<'_>) -> Value {
    json!({
        "data": {
            "attachment": {
                "id": response.attachment_id,
                "file_object_id": response.file_object_id,
                "filename": response.filename,
                "content_type": response.content_type,
                "byte_size": response.byte_size,
                "status": "uploaded"
            },
            "request": {"method": "GET", "url": response.url, "headers": {}},
            "expires_in_seconds": 60,
            "expires_at": (chrono::Utc::now() + chrono::Duration::seconds(60)).to_rfc3339(),
            "checksum_sha256": response.checksum_sha256,
            "encryption": response.encryption
        }
    })
}

fn download_path(label: &str) -> std::path::PathBuf {
    static FIXTURE_COUNTER: AtomicUsize = AtomicUsize::new(0);
    let nonce = FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "yuance-agent-download-{}-{label}-{nonce}.bin",
        std::process::id()
    ))
}

async fn server() -> (String, Requests) {
    let requests = Requests::default();
    let app = Router::new()
        .fallback(any(capture))
        .with_state(requests.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{address}"), requests)
}

async fn capture(
    State(requests): State<Requests>,
    method: Method,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let body = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap()
    };
    requests.lock().unwrap().push(CapturedRequest {
        method,
        uri: uri.to_string(),
        headers,
        body,
    });
    axum::Json(json!({"data": {"ok": true}}))
}

fn assert_request(request: &CapturedRequest, method: Method, path: &str) {
    assert_eq!(request.method, method);
    assert_eq!(request.uri.split('?').next().unwrap(), path);
}

fn assert_json_content_type(request: &CapturedRequest) {
    assert_eq!(
        request.headers.get("content-type").unwrap(),
        "application/json"
    );
}

fn query(uri: &str) -> HashMap<String, String> {
    let url = reqwest::Url::parse(&format!("http://localhost{uri}")).unwrap();
    url.query_pairs().into_owned().collect()
}

fn json_stderr(output: &Output) -> Value {
    serde_json::from_slice(&output.stderr).unwrap()
}
